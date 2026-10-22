import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

import { bindCorsRequest, corsHeaders, handleCors, type CorsOptions } from "../_shared/cors.ts";

const E2E_CORS: CorsOptions = {
  allowHeaders: "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  bindCorsRequest(req, E2E_CORS);
  const preflight = handleCors(req, E2E_CORS);
  if (preflight) return preflight;

  if (Deno.env.get("ENABLE_E2E_AUTH") !== "true") {
    return new Response(
      JSON.stringify({ error: "E2E session creation is disabled in production" }),
      {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    const { email } = await req.json();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr) throw linkErr;

    const otp = linkData.properties.email_otp;
    const { data: sessionData, error: sessionErr } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: "magiclink",
    });
    if (sessionErr) throw sessionErr;

    return new Response(JSON.stringify(sessionData.session), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
