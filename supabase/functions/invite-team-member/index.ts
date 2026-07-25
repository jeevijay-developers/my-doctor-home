import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Verify caller is admin
    const { data: userData } = await admin.auth.getUser(jwt);
    const callerId = userData?.user?.id;
    if (!callerId) throw new Error("Not authenticated");
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: callerId, _role: "admin" });
    if (!isAdmin) throw new Error("Not authorized");

    const { email, role } = await req.json();
    if (!email || !["admin", "staff"].includes(role)) throw new Error("Invalid payload");

    // Try invite; if user exists, fall through to just add role
    let userId: string | null = null;
    const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(email);
    if (invited?.user) {
      userId = invited.user.id;
    } else if (invErr) {
      const { data: list } = await admin.auth.admin.listUsers();
      const existing = list?.users?.find((u) => u.email === email);
      if (!existing) throw invErr;
      userId = existing.id;
    }

    if (!userId) throw new Error("Could not resolve user");

    // Ensure profile row exists (for FK convenience)
    await admin.from("profiles").upsert({ id: userId, full_name: email.split("@")[0] }, { onConflict: "id" });

    // Insert role (skip duplicate)
    const { data: exists } = await admin.from("user_roles").select("id").eq("user_id", userId).eq("role", role).maybeSingle();
    if (!exists) {
      const { error: roleErr } = await admin.from("user_roles").insert({ user_id: userId, role });
      if (roleErr) throw roleErr;
    }

    return new Response(JSON.stringify({ ok: true, user_id: userId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
