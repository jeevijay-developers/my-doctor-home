// Stub — Zoom integration is pending. When SDK/keys are configured,
// replace the body with a real Zoom meeting-creation call.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { appointment_id, doctor_id, datetime, duration } = await req.json().catch(() => ({}));
    return new Response(
      JSON.stringify({
        error: "Zoom integration pending — SDK not configured",
        appointment_id: appointment_id ?? null,
        doctor_id: doctor_id ?? null,
        datetime: datetime ?? null,
        duration: duration ?? null,
      }),
      { status: 501, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (_) {
    return new Response(JSON.stringify({ error: "Bad request" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
