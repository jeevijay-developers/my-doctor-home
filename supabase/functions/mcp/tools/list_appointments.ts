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
  name: "list_appointments",
  title: "List appointments",
  description:
    "List the signed-in doctor's appointments. Optionally filter by status, a date range, or limit the result count.",
  inputSchema: {
    status: z
      .enum(["pending", "confirmed", "completed", "cancelled", "no_show"])
      .optional()
      .describe("Filter by appointment status."),
    from_date: z.string().optional().describe("Start date (YYYY-MM-DD), inclusive."),
    to_date: z.string().optional().describe("End date (YYYY-MM-DD), inclusive."),
    limit: z.number().int().positive().max(200).optional().describe("Max rows to return. Default 50."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, from_date, to_date, limit }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    let q = db(ctx)
      .from("appointments")
      .select("id, patient_name, patient_phone, service_name, appointment_type, date, time_slot, status, token_number, amount, meeting_link, chief_complaint, created_at")
      .eq("doctor_id", ctx.getUserId())
      .order("date", { ascending: false })
      .order("time_slot", { ascending: false })
      .limit(limit ?? 50);
    if (status) q = q.eq("status", status);
    if (from_date) q = q.gte("date", from_date);
    if (to_date) q = q.lte("date", to_date);
    const { data, error } = await q;
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { count: data?.length ?? 0, appointments: data ?? [] },
    };
  },
});
