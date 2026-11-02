// Bootstrap Super Admin account. One-off endpoint.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

import { secretsMatch } from "../_shared/constantTime.ts";
import { bindCorsRequest, corsHeaders, handleCors, type CorsOptions } from "../_shared/cors.ts";

const BOOTSTRAP_CORS: CorsOptions = {
  allowHeaders: "authorization, x-client-info, apikey, content-type, x-bootstrap-secret",
};

Deno.serve(async (req) => {
  bindCorsRequest(req, BOOTSTRAP_CORS);
  const preflight = handleCors(req, BOOTSTRAP_CORS);
  if (preflight) return preflight;

  // BOOTSTRAP_ADMIN_SECRET is ALWAYS required (constant-time compare). The
  // ENABLE_BOOTSTRAP_ADMIN flag alone never opens this endpoint; with no secret
  // configured it is closed to everyone.
  const configuredSecret = Deno.env.get("BOOTSTRAP_ADMIN_SECRET")?.trim() || "";
  const providedSecret = req.headers.get("x-bootstrap-secret")?.trim() || "";
  const hasValidSecret = await secretsMatch(providedSecret, configuredSecret);

  if (!hasValidSecret) {
    return new Response(
      JSON.stringify({ ok: false, error: "Bootstrap admin endpoint is disabled" }),
      {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    const ADMIN_EMAIL = Deno.env.get("BOOTSTRAP_ADMIN_EMAIL")?.trim();
    if (!ADMIN_EMAIL) throw new Error("BOOTSTRAP_ADMIN_EMAIL is not configured");
    const ADMIN_PASSWORD = Deno.env.get("BOOTSTRAP_ADMIN_PASSWORD");
    if (!ADMIN_PASSWORD) throw new Error("BOOTSTRAP_ADMIN_PASSWORD is not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find or create user
    // Page through ALL users; a single page only covers the first 50-1000.
    const PER_PAGE = 1000;
    let user: { id: string; email?: string } | undefined;
    for (let page = 1; page <= 1000 && !user; page++) {
      const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ page, perPage: PER_PAGE });
      if (listErr) throw listErr;
      const users = list?.users ?? [];
      user = users.find((u) => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase());
      if (users.length < PER_PAGE) break;
    }

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
