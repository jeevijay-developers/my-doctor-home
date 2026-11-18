// Doctor self-service account deletion, confirmed by a phone OTP — no
// superadmin approval involved.
//
// Flow (the browser does steps 1-2 with Supabase Auth, this function does 3):
//   1. supabase.auth.signInWithOtp({ phone: <the account's own registered phone> })
//   2. supabase.auth.verifyOtp(...)  -> issues a fresh session whose JWT `amr`
//      claim records an OTP sign-in with a timestamp
//   3. POST here. We require that OTP sign-in to be recent (<= 5 minutes), so a
//      stolen/old session alone can never delete the account.
//
// Only doctor owners may use this. Clinic staff, superadmin team members and
// platform admins are refused. Deleting the auth user cascades to `profiles`
// and everything keyed to it (ON DELETE CASCADE); storage objects have no FK,
// so they are removed explicitly first.
import { createClient } from "npm:@supabase/supabase-js@2";
import { bindCorsRequest, corsHeaders, handleCors, type CorsOptions } from "../_shared/cors.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";

const CORS: CorsOptions = {
  allowHeaders: "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const OTP_MAX_AGE_SECONDS = 5 * 60;
const BUCKETS = ["doctor-uploads", "patient-documents"] as const;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Amr = { method?: string; timestamp?: number };

/** True when the token carries a phone-OTP sign-in from the last few minutes. */
function hasRecentOtp(amr: unknown, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  if (!Array.isArray(amr)) return false;
  return (amr as Amr[]).some(
    (entry) =>
      (entry?.method === "otp" || entry?.method === "sms") &&
      typeof entry.timestamp === "number" &&
      nowSeconds - entry.timestamp <= OTP_MAX_AGE_SECONDS &&
      entry.timestamp - nowSeconds < 60,
  );
}

// deno-lint-ignore no-explicit-any
async function removeFolder(admin: any, bucket: string, prefix: string): Promise<void> {
  const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error || !data) return;
  const files: string[] = [];
  for (const item of data) {
    // Folders come back without an id; recurse into them.
    if (item.id) files.push(`${prefix}/${item.name}`);
    else await removeFolder(admin, bucket, `${prefix}/${item.name}`);
  }
  if (files.length) await admin.storage.from(bucket).remove(files);
}

Deno.serve(async (req) => {
  bindCorsRequest(req, CORS);
  const preflight = handleCors(req, CORS);
  if (preflight) return preflight;
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Missing authorization" });
  const scoped = createClient(SUPABASE_URL, ANON_KEY);
  const { data: claimsData } = await scoped.auth.getClaims(authHeader.slice(7));
  const claims = claimsData?.claims;
  const userId = claims?.sub as string | undefined;
  if (!userId) return json(401, { error: "Invalid token" });

  let body: { confirm?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Bad request" });
  }
  if (body?.confirm !== true) return json(400, { error: "Deletion was not confirmed." });

  if (!hasRecentOtp(claims?.amr)) {
    return json(403, {
      error: "otp_required",
      message: "Verify the OTP sent to your registered mobile number to delete your account.",
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const limited = await enforceRateLimit(admin, {
    key: `delete-doctor-account:user:${userId}`,
    limit: 5,
    windowSeconds: 60 * 60,
  });
  if (limited) return limited;

  const [{ data: profile }, { data: staff }, { data: team }, { data: roles }] = await Promise.all([
    admin.from("profiles").select("id").eq("id", userId).maybeSingle(),
    admin.from("staff_members").select("id").eq("id", userId).maybeSingle(),
    admin.from("superadmin_team_members").select("id").eq("id", userId).maybeSingle(),
    admin.from("user_roles").select("role").eq("user_id", userId),
  ]);
  if (staff || team || (roles && roles.length > 0)) {
    return json(403, { error: "This account type cannot be deleted from here. Please contact support." });
  }
  if (!profile) return json(404, { error: "Doctor account not found" });

  // Staff logins belong to this clinic; they have no profile of their own, so
  // remove them too or they would be orphaned logins pointing at nothing.
  const { data: staffRows } = await admin.from("staff_members").select("id").eq("doctor_id", userId);

  for (const bucket of BUCKETS) {
    try {
      await removeFolder(admin, bucket, userId);
    } catch (err) {
      console.error("delete-doctor-account: storage cleanup failed", { bucket, message: err instanceof Error ? err.message : err });
    }
  }

  const { error: authErr } = await admin.auth.admin.deleteUser(userId);
  if (authErr) {
    console.error("delete-doctor-account: deleteUser failed", { userId, message: authErr.message });
    return json(500, { error: "Could not delete your account. Please try again or contact support." });
  }

  for (const row of staffRows ?? []) {
    const { error } = await admin.auth.admin.deleteUser(row.id);
    if (error) console.error("delete-doctor-account: staff login cleanup failed", { staffId: row.id, message: error.message });
  }

  return json(200, { ok: true });
});
