import { useCallback, useEffect, useId, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "./useProfile";
import { isCustomPlanActive, type CustomPlan, type PlanRequest } from "@/lib/customPlan";

// Doctor-side view of the Custom Plan Requests feature: the live custom plan
// (if any) plus the latest requests. Re-fetches over realtime so an approval
// from Superadmin changes the doctor's cards immediately, without a reload.
// The tables aren't in the generated Supabase types yet, hence the casts
// (same approach as pending_plans in SettingsPage).
export function useCustomPlan() {
  const { profile, isStaff } = useProfile();
  const [customPlan, setCustomPlan] = useState<CustomPlan | null>(null);
  const [requests, setRequests] = useState<PlanRequest[]>([]);
  const [loading, setLoading] = useState(true);
  // Several components (every checkout dialog) mount this hook at once; a shared
  // channel name would make them fight over one realtime subscription.
  const instanceId = useId();

  const refetch = useCallback(async () => {
    if (!profile?.id) return;
    const [planRes, reqRes] = await Promise.all([
      supabase.from("doctor_custom_plans" as any).select("*").eq("doctor_id", profile.id).maybeSingle(),
      isStaff
        ? Promise.resolve({ data: [] as any[] })
        : supabase.from("plan_requests" as any).select("*").eq("doctor_id", profile.id).order("created_at", { ascending: false }).limit(10),
    ]);
    const plan = (planRes.data as unknown as CustomPlan | null) ?? null;
    setCustomPlan(isCustomPlanActive(plan) ? plan : null);
    setRequests(((reqRes.data as unknown) as PlanRequest[]) ?? []);
    setLoading(false);
  }, [profile?.id, isStaff]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase
      .channel(`custom-plan-${profile.id}-${instanceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "doctor_custom_plans", filter: `doctor_id=eq.${profile.id}` }, () => refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "plan_requests", filter: `doctor_id=eq.${profile.id}` }, () => refetch())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, refetch, instanceId]);

  const pendingRequest = requests.find((r) => r.status === "pending") ?? null;
  const latestDecided = requests.find((r) => r.status === "approved" || r.status === "rejected") ?? null;

  return { customPlan, requests, pendingRequest, latestDecided, loading, refetch };
}
