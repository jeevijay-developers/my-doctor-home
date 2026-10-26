// DB-backed fixed-window rate limiter. Edge isolates do not share memory,
// so every check goes through public.consume_rate_limit (service role).
//
// Client IP: first x-forwarded-for entry, then cf-connecting-ip, else "unknown".
//
// Standard limits applied by callers:
//   create-razorpay-order  10 / 10 min per IP
//   ai-blog-writer         20 / hour per authenticated doctor
//   public form posts      5 / 10 min per IP (mock-otp-login, submit-patient-query)

import { activeCorsHeaders } from "./cors.ts";

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 128);
  }
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf.slice(0, 128);
  return "unknown";
}

/** Seconds until the current fixed window ends. Matches the SQL epoch alignment. */
export function retryAfterSeconds(windowSeconds: number, nowMs = Date.now()): number {
  const window = Math.max(1, Math.floor(windowSeconds));
  const now = Math.floor(nowMs / 1000);
  const remaining = window - (now % window);
  return Math.max(1, remaining);
}

type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

/**
 * Consumes one hit. Returns a 429 response when the window is exhausted,
 * a 503 when the limiter itself cannot be reached, or null when allowed.
 * Call only after bindCorsRequest so the 429 carries the right CORS headers.
 */
export async function enforceRateLimit(
  admin: unknown,
  spec: { key: string; limit: number; windowSeconds: number },
): Promise<Response | null> {
  const client = admin as RpcClient;
  const key = spec.key.trim().slice(0, 512);
  const { data, error } = await client.rpc("consume_rate_limit", {
    _key: key,
    _limit: spec.limit,
    _window_seconds: spec.windowSeconds,
  });

  if (error) {
    console.error("consume_rate_limit failed", error.message ?? error);
    return rateLimitResponse(30, { error: "rate_limit_unavailable" }, 503);
  }
  if (data === true) return null;
  return rateLimitResponse(retryAfterSeconds(spec.windowSeconds), { error: "Too many requests" }, 429);
}

function rateLimitResponse(retryAfter: number, body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...activeCorsHeaders(),
      "Content-Type": "application/json",
      "Retry-After": String(retryAfter),
    },
  });
}
