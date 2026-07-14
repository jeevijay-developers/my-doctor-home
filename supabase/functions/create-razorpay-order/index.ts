// Stub — Razorpay integration is pending. When keys are configured,
// replace the body with a real Razorpay order-creation call.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { appointment_id, amount } = await req.json().catch(() => ({}));
    return new Response(
      JSON.stringify({
        error: "Razorpay integration pending — API keys not configured",
        appointment_id: appointment_id ?? null,
        amount: amount ?? null,
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
