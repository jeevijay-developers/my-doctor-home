import { supabase } from "@/integrations/supabase/client";

export async function logAdminAction(
  action: string,
  targetTable?: string,
  targetId?: string,
  details?: Record<string, unknown>
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("admin_audit_log").insert({
    admin_user_id: user.id,
    action,
    target_table: targetTable ?? null,
    target_id: targetId ?? null,
    details: (details ?? null) as any,
  } as any);
}
