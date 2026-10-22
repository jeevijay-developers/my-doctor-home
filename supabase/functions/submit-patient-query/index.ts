// Public clinic enquiry form. The browser must not insert into patient_queries
// directly — that path cannot carry a Turnstile check. This function verifies
// captchaToken, validates the same fields the form enforces, confirms the
// doctor exists and is not cancelled, then inserts with the service role.
// The DB trigger enforce_patient_query_rate_limit remains a second guard.
import { createClient } from "npm:@supabase/supabase-js@2";
import { bindCorsRequest, corsHeaders, handleCors, type CorsOptions } from "../_shared/cors.ts";
import { clientIp, enforceRateLimit } from "../_shared/rateLimit.ts";
import { turnstileError } from "../_shared/turnstile.ts";

const CORS: CorsOptions = {
  allowHeaders: "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeIndianPhone(raw: string): string {
  let digits = raw.replace(/[^\d]/g, "");
  if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  return digits;
}

function isValidIndianPhone(raw: string): boolean {
  return /^[6-9]\d{9}$/.test(normalizeIndianPhone(raw));
}

type QueryBody = {
  doctor_id?: unknown;
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  message?: unknown;
  captchaToken?: unknown;
  website?: unknown;
};

Deno.serve(async (req) => {
  bindCorsRequest(req, CORS);
  const preflight = handleCors(req, CORS);
  if (preflight) return preflight;
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const ip = clientIp(req);
  const limited = await enforceRateLimit(admin, {
    key: `submit-patient-query:ip:${ip}`,
    limit: 5,
    windowSeconds: 10 * 60,
  });
  if (limited) return limited;

  let body: QueryBody;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Bad request" });
  }

  // Same silent honeypot as ContactQueryForm: a filled website field is a bot.
  if (typeof body.website === "string" && body.website.trim()) {
    return json(200, { ok: true });
  }

  const captcha = await turnstileError(body.captchaToken, ip);
  if (captcha) return json(400, captcha);

  if (typeof body.doctor_id !== "string" || !UUID_RE.test(body.doctor_id)) {
    return json(400, { error: "Missing doctor" });
  }
  if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 200) {
    return json(400, { error: "Please enter your name." });
  }
  if (typeof body.phone !== "string" || !body.phone.trim()) {
    return json(400, { error: "Please enter your phone number." });
  }
  if (!isValidIndianPhone(body.phone)) {
    return json(400, { error: "Enter a valid 10-digit Indian mobile number (starting with 6, 7, 8 or 9)." });
  }
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (body.email != null && typeof body.email !== "string") {
    return json(400, { error: "Enter a valid email or leave it blank." });
  }
  if (email && (!EMAIL_RE.test(email) || email.length > 254)) {
    return json(400, { error: "Enter a valid email or leave it blank." });
  }
  if (typeof body.message !== "string" || !body.message.trim()) {
    return json(400, { error: "Please enter your message." });
  }
  if (body.message.trim().length > 1000) {
    return json(400, { error: "Message is too long." });
  }

  const { data: doctor, error: doctorErr } = await admin
    .from("profiles")
    .select("id, plan_status")
    .eq("id", body.doctor_id)
    .maybeSingle();
  if (doctorErr) return json(500, { error: "Couldn't send your message. Please try again." });
  if (!doctor) return json(404, { error: "Doctor not found" });
  if (doctor.plan_status === "cancelled") {
    return json(400, { error: "This clinic is temporarily unavailable" });
  }

  const { error: insertErr } = await admin.from("patient_queries").insert({
    doctor_id: doctor.id,
    name: body.name.trim(),
    phone: normalizeIndianPhone(body.phone),
    email: email || null,
    message: body.message.trim(),
  });
  if (insertErr) {
    if (insertErr.message?.includes("PATIENT_QUERY_RATE_LIMITED")) {
      return json(429, {
        error: "PATIENT_QUERY_RATE_LIMITED",
        message: "Please wait a moment before sending another message.",
      });
    }
    console.error("submit-patient-query insert failed", insertErr.message);
    return json(500, { error: "Couldn't send your message. Please try again." });
  }

  return json(200, { ok: true });
});
