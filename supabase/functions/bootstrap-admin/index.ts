// Bootstrap Super Admin account. One-off endpoint.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

import { bindCorsRequest, corsHeaders, handleCors, type CorsOptions } from "../_shared/cors.ts";

const BOOTSTRAP_CORS: CorsOptions = {
  allowHeaders: "authorization, x-client-info, apikey, content-type, x-bootstrap-secret",
};

const ADMIN_EMAIL = Deno.env.get("BOOTSTRAP_ADMIN_EMAIL") ?? "jeevijayit@gmail.com";

Deno.serve(async (req) => {
  bindCorsRequest(req, BOOTSTRAP_CORS);
  const preflight = handleCors(req, BOOTSTRAP_CORS);
  if (preflight) return preflight;

  const enableBootstrap = Deno.env.get("ENABLE_BOOTSTRAP_ADMIN") === "true";
  const configuredSecret = Deno.env.get("BOOTSTRAP_ADMIN_SECRET")?.trim() || "";
  const providedSecret = req.headers.get("x-bootstrap-secret")?.trim() || "";
  const hasValidSecret = configuredSecret.length > 0 && providedSecret === configuredSecret;

  if (!enableBootstrap && !hasValidSecret) {
    return new Response(
      JSON.stringify({ ok: false, error: "Bootstrap admin endpoint is disabled" }),
      {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    const ADMIN_PASSWORD = Deno.env.get("BOOTSTRAP_ADMIN_PASSWORD");
    if (!ADMIN_PASSWORD) throw new Error("BOOTSTRAP_ADMIN_PASSWORD is not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find or create user
    const { data: list } = await supabase.auth.admin.listUsers();
    let user = list?.users?.find((u) => u.email === ADMIN_EMAIL);

    if (!user) {
      const { data, error } = await supabase.auth.admin.createUser({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        email_confirm: true,
      });
      if (error) throw error;
      user = data.user!;
    }

    const uid = user.id;

    // Ensure profile
    await supabase.from("profiles").upsert(
      { id: uid, full_name: "Jeevijay Admin", onboarding_completed: true },
      { onConflict: "id" }
    );

    // Ensure admin role
    const { data: existingRole } = await supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", uid)
      .eq("role", "admin")
      .maybeSingle();

    if (!existingRole) {
      await supabase.from("user_roles").insert({ user_id: uid, role: "admin" });
    }

    return new Response(JSON.stringify({ ok: true, user_id: uid }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
