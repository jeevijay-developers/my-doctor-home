import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { defineTool, type ToolContext } from "npm:@lovable.dev/mcp-js@0.24.0";

function db(ctx: ToolContext) {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "get_my_profile",
  title: "Get my doctor profile",
  description:
    "Return the signed-in doctor's Doctylia profile (name, specialization, slug, plan, contact details).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const { data, error } = await db(ctx)
      .from("profiles")
      .select("*")
      .eq("id", ctx.getUserId())
      .maybeSingle();
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data)
      return { content: [{ type: "text", text: "No profile found for this user." }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { profile: data },
    };
  },
});
