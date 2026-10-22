// Browser origin allowlist for every Edge Function.
//
// Native clients (the Android app) do not send an Origin header. Those
// requests are allowed through with Access-Control-Allow-Origin: *.
// Browser requests that DO send Origin get that origin echoed back only
// when it is on the allowlist, plus Vary: Origin. Any other origin is
// omitted from Access-Control-Allow-Origin so the browser rejects it.
//
// Per-request headers are stored in AsyncLocalStorage so existing
// `json()` helpers can keep their (status, body) signature and still
// attach the right CORS headers after `bindCorsRequest(req)`.

import { AsyncLocalStorage } from "node:async_hooks";

const ALLOWED_ORIGINS = new Set([
  "https://doctylia.com",
  "https://www.doctylia.com",
  "http://localhost:8080",
  "http://localhost:5173",
]);

export const DEFAULT_ALLOW_HEADERS = "authorization, x-client-info, apikey, content-type";

export type CorsOptions = {
  /** Kept exactly as each function sent it before the allowlist change. */
  allowHeaders?: string;
  /** Omitted entirely when the function did not previously send this header. */
  allowMethods?: string;
};

type CorsContext = {
  req: Request;
  options?: CorsOptions;
};

const corsStore = new AsyncLocalStorage<CorsContext>();

export function bindCorsRequest(req: Request, options?: CorsOptions): void {
  corsStore.enterWith({ req, options });
}

export function buildCorsHeaders(req: Request, options?: CorsOptions): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": options?.allowHeaders ?? DEFAULT_ALLOW_HEADERS,
    "Vary": "Origin",
  };
  if (options?.allowMethods) {
    headers["Access-Control-Allow-Methods"] = options.allowMethods;
  }

  const origin = req.headers.get("Origin");
  if (!origin) {
    headers["Access-Control-Allow-Origin"] = "*";
    return headers;
  }
  if (ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

/** OPTIONS preflight. Returns null for every other method. */
export function handleCors(req: Request, options?: CorsOptions): Response | null {
  if (req.method !== "OPTIONS") return null;
  const resolved = options ?? corsStore.getStore()?.options;
  return new Response(null, { status: 200, headers: buildCorsHeaders(req, resolved) });
}

export function activeCorsHeaders(): Record<string, string> {
  const ctx = corsStore.getStore();
  if (!ctx) {
    console.error("cors: response built without bindCorsRequest(); omitting Access-Control-Allow-Origin");
    return {
      "Access-Control-Allow-Headers": DEFAULT_ALLOW_HEADERS,
      "Vary": "Origin",
    };
  }
  return buildCorsHeaders(ctx.req, ctx.options);
}

// Spreadable stand-in for the old `corsHeaders` constant. Property access
// resolves against the request bound with bindCorsRequest().
export const corsHeaders: Record<string, string> = new Proxy({} as Record<string, string>, {
  get(_target, prop) {
    if (typeof prop !== "string") return undefined;
    return activeCorsHeaders()[prop];
  },
  has(_target, prop) {
    return typeof prop === "string" && Object.prototype.hasOwnProperty.call(activeCorsHeaders(), prop);
  },
  ownKeys() {
    return Object.keys(activeCorsHeaders());
  },
  getOwnPropertyDescriptor(_target, prop) {
    if (typeof prop !== "string") return undefined;
    const headers = activeCorsHeaders();
    if (!Object.prototype.hasOwnProperty.call(headers, prop)) return undefined;
    return { configurable: true, enumerable: true, writable: false, value: headers[prop] };
  },
});
