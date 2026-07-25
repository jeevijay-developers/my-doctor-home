// Bootstrap Super Admin account. One-off endpoint.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAIL = "jeevijayit@gmail.com";
const ADMIN_PASSWORD = "doctylia@Jeevijay123";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
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
