import { useCallback, useEffect, useId, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "./useProfile";
import type { FeatureKey } from "@/lib/features";

export type FeatureAccessRow = {
  feature_key: string;
  label: string;
  description: string;
  default_min_tier: string;
  included_by_plan: boolean;
  override_enabled: boolean | null;
  override_granted_by: string | null;
  override_granted_at: string | null;
  override_reason: string | null;
  override_expires_at: string | null;
  override_active: boolean;
  effective_enabled: boolean;
  source?: "override" | "custom_plan" | "plan";
  custom_plan_effect?: "added" | "removed" | null;
  is_requestable?: boolean;
};

// Doctor/staff-side entitlement check — layers Superadmin per-doctor
// overrides (doctor_feature_overrides) on top of the plan default in one
// bulk RPC call, and re-fetches on any override change via realtime so a
// newly-unlocked feature becomes usable without a re-login.
export function useFeatureAccess() {
  const { profile } = useProfile();
  const [rows, setRows] = useState<FeatureAccessRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Responses can resolve out of order (mount fetch + realtime events, or a
  // profile switch); only the newest request may write state.
  const requestSeq = useRef(0);
  // Many components mount this hook at once; a shared channel name makes them
  // fight over one realtime subscription.
  const instanceId = useId();

  const refetch = useCallback(async () => {
    if (!profile?.id) return;
    const seq = ++requestSeq.current;
    const { data, error } = await supabase.rpc("get_doctor_feature_access", { _doctor_id: profile.id });
    if (seq !== requestSeq.current) return;
    // A transient failure (network blip, token refresh) must not lock every
    // feature: keep what we already knew instead of replacing it with [].
    if (!error) setRows((data as FeatureAccessRow[]) || []);
    setLoading(false);
  }, [profile?.id]);

  // Refetch when the plan itself changes (tier switch, activation, expiry),
  // not only on override / custom-plan row changes.
  useEffect(() => {
    refetch();
  }, [refetch, profile?.plan_tier, profile?.plan_status, profile?.plan_end]);

  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase
      .channel(`feature-overrides-${profile.id}-${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "doctor_feature_overrides", filter: `doctor_id=eq.${profile.id}` },
        () => refetch()
      )
      // An approved/cancelled/expired custom plan changes effective access too.
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "doctor_custom_plans", filter: `doctor_id=eq.${profile.id}` },
        () => refetch()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, refetch, instanceId]);

  const hasFeature = useCallback((key: FeatureKey) => rows.find((r) => r.feature_key === key)?.effective_enabled ?? false, [rows]);

  // Why a feature is off (override / custom plan / plain plan), so the UI can
  // say "contact support" instead of selling an upgrade that won't help.
  const sourceOf = useCallback((key: FeatureKey) => rows.find((r) => r.feature_key === key)?.source, [rows]);

  return { rows, hasFeature, sourceOf, loading, refetch };
}
