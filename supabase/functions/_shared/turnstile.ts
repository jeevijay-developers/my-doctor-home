// Cloudflare Turnstile siteverify.
//
// Callers read the token from the JSON body field `captchaToken`
// (that exact name — the frontend widget must match it).
//
// TURNSTILE_SECRET_KEY   server secret. Required in production.
// TURNSTILE_DISABLED=true fail open ONLY when the secret is unset
//                         (local/dev). A configured secret is always checked.

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function secret(): string {
  return Deno.env.get("TURNSTILE_SECRET_KEY")?.trim() ?? "";
}

/** True only when no secret is configured and Turnstile is explicitly disabled. */
export function turnstileFailOpen(): boolean {
  return secret().length === 0 && Deno.env.get("TURNSTILE_DISABLED") === "true";
}

export async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const key = secret();
  if (!key) {
    return Deno.env.get("TURNSTILE_DISABLED") === "true";
  }
  const responseToken = token?.trim() ?? "";
  if (!responseToken) return false;

  const body = new URLSearchParams();
  body.set("secret", key);
  body.set("response", responseToken);
  if (ip && ip !== "unknown") body.set("remoteip", ip);

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null) as { success?: boolean } | null;
    return data?.success === true;
  } catch (err) {
    console.error("turnstile siteverify failed", err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * `captchaToken` from the request JSON.
 * Returns a 400 body when the token is missing or rejected, or null to proceed.
 */
export async function turnstileError(
  token: unknown,
  ip: string,
): Promise<{ error: "captcha_required" | "captcha_failed" } | null> {
  if (turnstileFailOpen()) return null;
  const value = typeof token === "string" ? token.trim() : "";
  if (!value) return { error: "captcha_required" };
  const ok = await verifyTurnstile(value, ip);
  return ok ? null : { error: "captcha_failed" };
}
