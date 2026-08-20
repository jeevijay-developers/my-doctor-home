import { useCallback, useEffect, useState } from "react";
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
};

// Doctor/staff-side entitlement check — layers Superadmin per-doctor
// overrides (doctor_feature_overrides) on top of the plan default in one
// bulk RPC call, and re-fetches on any override change via realtime so a
// newly-unlocked feature becomes usable without a re-login.
export function useFeatureAccess() {
  const { profile } = useProfile();
  const [rows, setRows] = useState<FeatureAccessRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!profile?.id) return;
    const { data } = await supabase.rpc("get_doctor_feature_access", { _doctor_id: profile.id });
    setRows((data as FeatureAccessRow[]) || []);
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase
      .channel(`feature-overrides-${profile.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "doctor_feature_overrides", filter: `doctor_id=eq.${profile.id}` },
        () => refetch()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, refetch]);

  const hasFeature = useCallback((key: FeatureKey) => rows.find((r) => r.feature_key === key)?.effective_enabled ?? false, [rows]);

  return { rows, hasFeature, loading, refetch };
}
