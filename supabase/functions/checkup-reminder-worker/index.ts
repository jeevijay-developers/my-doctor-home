// Checkup Reminder & Notification — the periodic worker.
//
// Two callers:
//   1. The pg_cron job (see the checkup_reminder_cron migration), which
//      authenticates with the project's own service role key — treated as
//      the "system" caller and allowed to sweep every doctor's due
//      reminders in one run.
//   2. A doctor or permitted staff member's own session, via the "Run
//      Reminder Worker" button in CheckupReminderTab — scoped to ONLY that
//      doctor's reminders, so a doctor can never trigger another doctor's
//      sends.
//
// Duplicate-send prevention: for each due reminder, the worker "claims" it
// with a single atomic `UPDATE ... WHERE next_reminder_at <= now() AND
// (last_reminder_sent_at IS NULL OR last_reminder_sent_at < next_reminder_at)
// RETURNING *` that simultaneously advances next_checkup_date/next_reminder_at
// forward to the next cycle. Only a reminder whose row is actually returned
// by that update gets processed — if two worker runs overlap (e.g. cron and
// a manual trigger firing close together), only one of them can win the
// claim, and by the time either re-checks, next_reminder_at has already
// moved into the future, so a second attempt can never match the WHERE
// clause again.
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendWhatsApp, sendSms, corsHeaders, json } from "../_shared/notificationProviders.ts";
import { WHATSAPP_CHECKUP_TEMPLATE, SMS_CHECKUP_TEMPLATE, IN_APP_CHECKUP_TEMPLATE, renderTemplate } from "../_shared/notificationTemplates.ts";
import { addFrequency, subtractDays, type Frequency } from "../_shared/checkupSchedule.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

type ReminderRow = {
  id: string; patient_id: string; doctor_id: string; frequency: Frequency;
  custom_interval_days: number | null; next_checkup_date: string; reminder_before_days: number;
  whatsapp_enabled: boolean; sms_enabled: boolean; in_app_enabled: boolean;
  last_reminder_sent_at: string | null; next_reminder_at: string;
  patients: { name: string; phone: string } | null;
  profiles: { full_name: string | null } | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const authHeader = req.headers.get("Authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!bearer) return json(401, { error: "Missing authorization" });

  let doctorScope: string | null = null; // null = system caller, sweep every doctor
  if (bearer !== SUPABASE_SERVICE_ROLE_KEY) {
    const scoped = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: claims } = await scoped.auth.getClaims(bearer);
    const callerId = claims?.claims?.sub as string | undefined;
    if (!callerId) return json(401, { error: "Invalid token" });

    const { data: callerProfile } = await admin.from("profiles").select("id").eq("id", callerId).maybeSingle();
    if (callerProfile) {
      doctorScope = callerProfile.id;
    } else {
      const { data: callerStaff } = await admin.from("staff_members").select("doctor_id, status, permissions").eq("id", callerId).maybeSingle();
      if (callerStaff && callerStaff.status === "active" && (callerStaff.permissions as Record<string, boolean>)?.["patients.medical_records"] === true) {
        doctorScope = callerStaff.doctor_id;
      }
    }
    if (!doctorScope) return json(403, { error: "Not authorized to run the reminder worker" });
  }

  let candidatesQuery = admin
    .from("patient_checkup_reminders")
    .select("id, patient_id, doctor_id, frequency, custom_interval_days, next_checkup_date, reminder_before_days, whatsapp_enabled, sms_enabled, in_app_enabled, last_reminder_sent_at, next_reminder_at, patients(name, phone), profiles:doctor_id(full_name)")
    .eq("status", "active")
    .lte("next_reminder_at", new Date().toISOString());
  if (doctorScope) candidatesQuery = candidatesQuery.eq("doctor_id", doctorScope);

  const { data: candidates, error: candErr } = await candidatesQuery;
  if (candErr) {
    console.error("checkup-reminder-worker: candidate query failed", { code: candErr.code, message: candErr.message });
    return json(500, { error: "Could not load due reminders" });
  }

  const results: { reminder_id: string; claimed: boolean; channels: string[] }[] = [];

  for (const raw of (candidates || []) as unknown as ReminderRow[]) {
    const nextCheckupDate = addFrequency(raw.next_checkup_date, raw.frequency, raw.custom_interval_days);
    const nextReminderAt = subtractDays(nextCheckupDate, raw.reminder_before_days);

    // Atomic claim: only proceed if this exact row (still due, not already
    // claimed by a concurrent run) is the one actually updated.
    const { data: claimed, error: claimErr } = await admin
      .from("patient_checkup_reminders")
      .update({
        last_reminder_sent_at: new Date().toISOString(),
        next_checkup_date: nextCheckupDate,
        next_reminder_at: `${nextReminderAt}T00:00:00Z`,
      })
      .eq("id", raw.id)
      .eq("status", "active")
      .lte("next_reminder_at", new Date().toISOString())
      .or(`last_reminder_sent_at.is.null,last_reminder_sent_at.lt.${raw.next_reminder_at}`)
      .select("id")
      .maybeSingle();

    if (claimErr) {
      console.error("checkup-reminder-worker: claim failed", { reminderId: raw.id, code: claimErr.code, message: claimErr.message });
      continue;
    }
    if (!claimed) {
      results.push({ reminder_id: raw.id, claimed: false, channels: [] });
      continue;
    }

    const patientName = raw.patients?.name || "Patient";
    const patientPhone = raw.patients?.phone || "";
    const doctorName = raw.profiles?.full_name || "your doctor";
    const checkupDateLabel = new Date(`${raw.next_checkup_date}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
    const vars = { patient_name: patientName, doctor_name: doctorName, checkup_date: checkupDateLabel };

    const sentChannels: string[] = [];

    if (raw.whatsapp_enabled && patientPhone) {
      sentChannels.push("whatsapp");
      await createAndSend(raw, "whatsapp", patientPhone, renderTemplate(WHATSAPP_CHECKUP_TEMPLATE, vars), false);
    }
    if (raw.sms_enabled && patientPhone) {
      sentChannels.push("sms");
      await createAndSend(raw, "sms", patientPhone, renderTemplate(SMS_CHECKUP_TEMPLATE, vars), false);
    }
    if (raw.in_app_enabled) {
      sentChannels.push("in_app");
      const { error: logErr } = await admin.from("notification_logs").insert({
        patient_id: raw.patient_id, doctor_id: raw.doctor_id, reminder_id: raw.id,
        channel: "in_app", notification_type: "checkup_reminder", recipient: null,
        message: renderTemplate(IN_APP_CHECKUP_TEMPLATE, vars), status: "sent", sent_at: new Date().toISOString(), is_test: false,
      });
      if (logErr) console.error("checkup-reminder-worker: in_app log insert failed", { reminderId: raw.id, code: logErr.code, message: logErr.message });
    }

    results.push({ reminder_id: raw.id, claimed: true, channels: sentChannels });
  }

  return json(200, { ok: true, scope: doctorScope ? "doctor" : "system", processed: results.filter((r) => r.claimed).length, results });
});

async function createAndSend(
  reminder: ReminderRow, channel: "whatsapp" | "sms", recipient: string, message: string, isTest: boolean,
) {
  const { data: log, error: insertErr } = await admin.from("notification_logs").insert({
    patient_id: reminder.patient_id, doctor_id: reminder.doctor_id, reminder_id: reminder.id,
    channel, notification_type: isTest ? "test_reminder" : "checkup_reminder", recipient, message, status: "pending", is_test: isTest,
  }).select("id").single();
  if (insertErr || !log) {
    console.error("checkup-reminder-worker: notification_logs insert failed", { reminderId: reminder.id, channel, code: insertErr?.code, message: insertErr?.message });
    return;
  }

  const result = channel === "whatsapp" ? await sendWhatsApp(recipient, message) : await sendSms(recipient, message);
  await admin.from("notification_logs").update({
    status: result.status, provider: result.provider, provider_message_id: result.provider_message_id,
    error_message: result.error_message, sent_at: result.status === "failed" ? null : new Date().toISOString(),
  }).eq("id", log.id);
}
