import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { defineTool, type ToolContext } from "npm:@lovable.dev/mcp-js@0.24.0";
import { z } from "npm:zod@3.23.8";

function db(ctx: ToolContext) {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_reviews",
  title: "List patient reviews",
  description: "List patient reviews for the signed-in doctor. Optionally filter by minimum star rating.",
  inputSchema: {
    min_rating: z.number().int().min(1).max(5).optional().describe("Only return reviews with rating >= this value."),
    limit: z.number().int().positive().max(200).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ min_rating, limit }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    let q = db(ctx)
      .from("reviews")
      .select("*")
      .eq("doctor_id", ctx.getUserId())
      .order("created_at", { ascending: false })
      .limit(limit ?? 50);
    if (min_rating) q = q.gte("rating", min_rating);
    const { data, error } = await q;
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { count: data?.length ?? 0, reviews: data ?? [] },
    };
  },
});
