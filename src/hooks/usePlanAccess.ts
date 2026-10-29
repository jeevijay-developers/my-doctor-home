import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "./useProfile";

export interface PlanAccess {
  isPremium: boolean;
  appointmentsUsed: number;
  /** The doctor's effective monthly limit; 0 when unlimited. */
  appointmentsCap: number;
  /** Premium, trial, or a custom plan with unlimited appointments. */
  appointmentsUnlimited?: boolean;
  /** The platform's standard Pro limit, whatever custom plan applies (for the plan cards). */
  standardCap?: number;
  nearCap: boolean;
  loading: boolean;
}

const NEAR_CAP_THRESHOLD = 0.9;

export function usePlanAccess(): PlanAccess {
  const { profile } = useProfile();
  const [state, setState] = useState<Required<Omit<PlanAccess, "loading">>>({
    isPremium: false,
    appointmentsUsed: 0,
    appointmentsCap: 0,
    appointmentsUnlimited: false,
    standardCap: 0,
    nearCap: false,
  });
  const [loading, setLoading] = useState(true);
  // An approved custom plan can change the limit without touching the profile row, so also
  // re-read when the doctor comes back to the tab.
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    let last = Date.now();
    // Returning to the tab: at most once every 30 seconds, however many components use this hook.
    const onVisible = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 30_000) return;
      last = Date.now();
      setRefreshKey((k) => k + 1);
    };
    // The custom plan changed (approved, edited, ended): re-read right away.
    const onPlanChanged = () => { last = Date.now(); setRefreshKey((k) => k + 1); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("doctylia:custom-plan-changed", onPlanChanged);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("doctylia:custom-plan-changed", onPlanChanged);
    };
  }, []);

  useEffect(() => {
    if (!profile?.id) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    supabase.rpc("get_appointment_cap_usage", { _doctor_id: profile.id }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        // Keep the previous answer rather than silently downgrading to "not premium".
        setLoading(false);
        return;
      }
      // get_appointment_cap_usage gained columns after types.ts was generated.
      const row = (data as any)?.[0] as
        | { is_premium?: boolean; appointments_used?: number; appointments_cap?: number; appointments_unlimited?: boolean; standard_cap?: number }
        | undefined;
      const isPremium = row?.is_premium ?? false;
      const appointmentsUsed = row?.appointments_used ?? 0;
      const appointmentsCap = row?.appointments_cap ?? 0;
      const appointmentsUnlimited = row?.appointments_unlimited ?? isPremium;
      const standardCap = row?.standard_cap ?? 0;
      const nearCap = !isPremium && !appointmentsUnlimited && appointmentsCap > 0 && appointmentsUsed / appointmentsCap >= NEAR_CAP_THRESHOLD;
      const next = { isPremium, appointmentsUsed, appointmentsCap, appointmentsUnlimited, standardCap, nearCap };
      // Same answer: keep the old object so nothing that reads this hook re-renders for nothing.
      setState((prev) => (Object.keys(next).every((k) => (prev as Record<string, unknown>)[k] === (next as Record<string, unknown>)[k]) ? prev : next));
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // plan_tier / plan_status / plan_end are included so a tier change (self-service upgrade,
    // or any other update to the doctor's own profile) re-fetches premium
    // status immediately — profile?.id alone doesn't change on a tier flip,
    // so without this, isPremium stayed stale until a full page reload.
  }, [profile?.id, profile?.plan_tier, profile?.plan_status, profile?.plan_end, refreshKey]);

  return { ...state, loading };
}
