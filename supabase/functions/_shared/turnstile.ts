// Cloudflare Turnstile siteverify.
//
// Callers read the token from the JSON body field `captchaToken`
// (that exact name — the frontend widget must match it) and pass the
// same `action` string the widget was rendered with.
//
// TURNSTILE_SECRET_KEY or TURNSTILE_SECRET  server secret. Required in production.
// TURNSTILE_HOSTNAMES   comma-separated frontend hosts (no localhost in prod).
// TURNSTILE_DISABLED=true fail open ONLY when the secret is unset (local/dev).

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_TOKEN_LENGTH = 2048;
const DEFAULT_HOSTNAMES = ["doctylia.com", "www.doctylia.com"];

function secret(): string {
  return (
    Deno.env.get("TURNSTILE_SECRET_KEY")?.trim() ||
    Deno.env.get("TURNSTILE_SECRET")?.trim() ||
    ""
  );
}

function expectedHostnames(): Set<string> {
  const raw = Deno.env.get("TURNSTILE_HOSTNAMES")?.trim();
  const list = (raw ? raw.split(",") : DEFAULT_HOSTNAMES)
    .map((hostname) => hostname.trim().toLowerCase())
    .filter(Boolean);
  return new Set(list);
}

/** True only when no secret is configured and Turnstile is explicitly disabled. */
export function turnstileFailOpen(): boolean {
  return secret().length === 0 && Deno.env.get("TURNSTILE_DISABLED") === "true";
}

export async function verifyTurnstile(
  token: string,
  ip: string,
  expectedAction: string,
): Promise<boolean> {
  const key = secret();
  if (!key) {
    return Deno.env.get("TURNSTILE_DISABLED") === "true";
  }
  if (
    typeof token !== "string" ||
    token.length === 0 ||
    token.length > MAX_TOKEN_LENGTH ||
    !expectedAction
  ) {
    return false;
  }

  const hosts = expectedHostnames();
  if (hosts.size === 0) return false;

  const body = new URLSearchParams();
  body.set("secret", key);
  body.set("response", token);
  if (ip && ip !== "unknown") body.set("remoteip", ip);

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null) as {
      success?: boolean;
      action?: string;
      hostname?: string;
    } | null;
    if (!data?.success) return false;
    if (data.action !== expectedAction) return false;
    const hostname = typeof data.hostname === "string" ? data.hostname.toLowerCase() : "";
    return hosts.has(hostname);
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
  expectedAction: string,
): Promise<{ error: "captcha_required" | "captcha_failed" } | null> {
  if (turnstileFailOpen()) return null;
  const value = typeof token === "string" ? token.trim() : "";
  if (!value || value.length > MAX_TOKEN_LENGTH) return { error: "captcha_required" };
  const ok = await verifyTurnstile(value, ip, expectedAction);
  return ok ? null : { error: "captcha_failed" };
}
