import { useCallback, useEffect, useId, useMemo, useState } from "react";
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
  // The raw row, plus a tick that re-evaluates "active" when its window opens or
  // closes — realtime only fires on row changes, so without this a plan that
  // expires (or starts) while the page is open would keep showing stale state.
  const [rawPlan, setRawPlan] = useState<CustomPlan | null>(null);
  const [tick, setTick] = useState(0);
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
    // A failed query must not erase what we already know (it would hide an
    // active plan and show the standard price).
    if (!planRes.error) setRawPlan((planRes.data as unknown as CustomPlan | null) ?? null);
    if (!(reqRes as any).error) setRequests(((reqRes.data as unknown) as PlanRequest[]) ?? []);
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

  useEffect(() => {
    if (!rawPlan || rawPlan.status !== "active") return;
    const now = Date.now();
    const edges = [rawPlan.valid_from, rawPlan.valid_until]
      .filter((d): d is string => !!d)
      .map((d) => new Date(d).getTime())
      .filter((t) => t > now);
    if (edges.length === 0) return;
    // setTimeout overflows past ~24.8 days; re-check at that cap instead.
    const wait = Math.min(Math.min(...edges) - now + 500, 2_000_000_000);
    const t = setTimeout(() => {
      setTick((n) => n + 1);
      refetch();
    }, wait);
    return () => clearTimeout(t);
  }, [rawPlan, tick, refetch]);

  const customPlan = useMemo(() => (isCustomPlanActive(rawPlan) ? rawPlan : null), [rawPlan, tick]);

  const pendingRequest = requests.find((r) => r.status === "pending") ?? null;
  const latestDecided = requests.find((r) => r.status === "approved" || r.status === "rejected") ?? null;

  return { customPlan, requests, pendingRequest, latestDecided, loading, refetch };
}
