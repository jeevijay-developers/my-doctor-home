// Standalone SMS send endpoint — mirrors send-whatsapp-notification/index.ts
// exactly (see its header comment for the split between this HTTP-invokable
// path and the worker's in-process path). Kept as a fully separate function
// rather than a shared handler so each channel's future live-provider
// wiring stays independently deployable.
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendSms, corsHeaders, json } from "../_shared/notificationProviders.ts";
import { SMS_CHECKUP_TEMPLATE, renderTemplate } from "../_shared/notificationTemplates.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Missing authorization" });
  const scoped = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: claims } = await scoped.auth.getClaims(authHeader.slice(7));
  const callerId = claims?.claims?.sub as string | undefined;
  if (!callerId) return json(401, { error: "Invalid token" });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Bad request" });
  }
  const patientId = String(body?.patient_id || "");
  const isTest = body?.is_test === true;
  const reminderId = body?.reminder_id ? String(body.reminder_id) : null;
  if (!patientId) return json(400, { error: "patient_id is required" });

  const { data: patient } = await admin.from("patients").select("id, name, phone, doctor_id").eq("id", patientId).maybeSingle();
  if (!patient) return json(404, { error: "Patient not found" });
  if (!patient.phone) return json(400, { error: "This patient has no phone number on file" });

  const authorized = await isAuthorizedForDoctor(callerId, patient.doctor_id);
  if (!authorized) return json(403, { error: "Not authorized for this patient" });

  const { data: doctor } = await admin.from("profiles").select("full_name").eq("id", patient.doctor_id).maybeSingle();

  const checkupDate = body?.checkup_date
    ? new Date(`${body.checkup_date}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })
    : "your next visit";
  const message = body?.message || renderTemplate(SMS_CHECKUP_TEMPLATE, {
    patient_name: patient.name, doctor_name: doctor?.full_name || "your doctor", checkup_date: checkupDate,
  });

  const { data: log, error: insertErr } = await admin.from("notification_logs").insert({
    patient_id: patient.id, doctor_id: patient.doctor_id, reminder_id: reminderId,
    channel: "sms", notification_type: isTest ? "test_reminder" : "manual", recipient: patient.phone,
    message, status: "pending", is_test: isTest,
  }).select("*").single();
  if (insertErr || !log) {
    console.error("send-sms-notification: log insert failed", { code: insertErr?.code, message: insertErr?.message });
    return json(500, { error: "Could not create notification log" });
  }

  const result = await sendSms(patient.phone, message);
  const { data: updated } = await admin.from("notification_logs").update({
    status: result.status, provider: result.provider, provider_message_id: result.provider_message_id,
    error_message: result.error_message, sent_at: result.status === "failed" ? null : new Date().toISOString(),
  }).eq("id", log.id).select("*").single();

  return json(200, { ok: true, notification: updated || log });
});

async function isAuthorizedForDoctor(callerId: string, doctorId: string): Promise<boolean> {
  if (callerId === doctorId) return true;
  const { data: staff } = await admin.from("staff_members").select("doctor_id, status, permissions").eq("id", callerId).maybeSingle();
  return !!(staff && staff.status === "active" && staff.doctor_id === doctorId && (staff.permissions as Record<string, boolean>)?.["patients.medical_records"] === true);
}
