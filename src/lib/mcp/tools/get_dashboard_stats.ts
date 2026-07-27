import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";

function db(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "get_dashboard_stats",
  title: "Get dashboard stats",
  description:
    "Return quick counts for the signed-in doctor: total patients, total appointments, today's appointments, and pending appointments.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const client = db(ctx);
    const uid = ctx.getUserId();
    const today = new Date().toISOString().slice(0, 10);
    const [patients, appts, todayAppts, pending] = await Promise.all([
      client.from("patients").select("id", { count: "exact", head: true }).eq("doctor_id", uid),
      client.from("appointments").select("id", { count: "exact", head: true }).eq("doctor_id", uid),
      client.from("appointments").select("id", { count: "exact", head: true }).eq("doctor_id", uid).eq("date", today),
      client.from("appointments").select("id", { count: "exact", head: true }).eq("doctor_id", uid).eq("status", "pending"),
    ]);
    const stats = {
      total_patients: patients.count ?? 0,
      total_appointments: appts.count ?? 0,
      appointments_today: todayAppts.count ?? 0,
      pending_appointments: pending.count ?? 0,
      date: today,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(stats, null, 2) }],
      structuredContent: stats,
    };
  },
});
