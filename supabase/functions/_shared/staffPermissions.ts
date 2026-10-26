import { bindCorsRequest, corsHeaders, handleCors, type CorsOptions } from "./cors.ts";

// Canonical staff permission keys — must mirror src/lib/staffPermissions.ts
// exactly (duplicated, not imported: edge functions run on Deno and cannot
// import from src/, per this repo's established cross-runtime convention).
export const STAFF_PERMISSION_KEYS = [
  "dashboard.view",
  "website.view", "website.edit", "website.settings",
  "appointments.view", "appointments.create", "appointments.edit", "appointments.cancel",
  "patients.view", "patients.add", "patients.edit", "patients.medical_records",
  "prescriptions.view", "prescriptions.create", "prescriptions.edit",
  "reviews.view", "reviews.manage",
  "blog.view", "blog.create", "blog.edit", "blog.delete",
  "billing.view", "billing.manage",
  "profile.view", "profile.edit",
  "staff.view", "staff.create", "staff.edit", "staff.disable",
  "inquiries.view", "inquiries.manage",
] as const;

const KEY_SET = new Set<string>(STAFF_PERMISSION_KEYS);

// Strips unknown keys and coerces every recognized key to a strict boolean —
// never trust a client-supplied permissions object verbatim.
export function sanitizePermissions(input: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (!input || typeof input !== "object") return out;
  for (const key of Object.keys(input as Record<string, unknown>)) {
    if (KEY_SET.has(key)) out[key] = (input as Record<string, unknown>)[key] === true;
  }
  return out;
}

// Mirrors normalizePhoneNumber in src/lib/auth/otp/productionOtpService.ts
// (bare 10-digit numbers default to +91). Returns null unless the result is
// valid E.164 — the form GoTrue stores in auth.users.phone (minus the "+")
// and the staff_members.phone CHECK constraint expects.
export function normalizeStaffPhone(input: unknown): string | null {
  const cleaned = String(input || "").replace(/[\s-]/g, "");
  const e164 = /^\d{10}$/.test(cleaned) ? `+91${cleaned}` : cleaned;
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}

export { corsHeaders };

const STAFF_CORS: CorsOptions = {
  allowHeaders: "authorization, x-client-info, apikey, content-type",
};

export function beginStaffRequest(req: Request): Response | null {
  bindCorsRequest(req, STAFF_CORS);
  return handleCors(req, STAFF_CORS);
}

export function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
