// Public, read-only: lets the Doctor/Super Admin testing dashboards show a
// MOCK/LIVE badge proactively, mirroring get-payment-mode/index.ts exactly.
// Reports "live" only if BOTH WhatsApp and SMS have real credentials
// configured — if either channel is still unconfigured, the platform as a
// whole is still meaningfully in test mode.
import { resolveNotificationMode, corsHeaders, json } from "../_shared/notificationProviders.ts";

const WHATSAPP_API_KEY = Deno.env.get("WHATSAPP_API_KEY");
const WHATSAPP_API_URL = Deno.env.get("WHATSAPP_API_URL");
const SMS_API_KEY = Deno.env.get("SMS_API_KEY");
const SMS_API_URL = Deno.env.get("SMS_API_URL");

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") return json(405, { error: "Method not allowed" });

  const hasLiveCredentials = Boolean(WHATSAPP_API_KEY && WHATSAPP_API_URL && SMS_API_KEY && SMS_API_URL);
  const mode = resolveNotificationMode(hasLiveCredentials);
  return json(200, { mode });
});
