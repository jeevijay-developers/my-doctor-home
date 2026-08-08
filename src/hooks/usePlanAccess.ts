import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "./useProfile";

export interface PlanAccess {
  isPremium: boolean;
  appointmentsUsed: number;
  appointmentsCap: number;
  nearCap: boolean;
  loading: boolean;
}

const NEAR_CAP_THRESHOLD = 0.9;

export function usePlanAccess(): PlanAccess {
  const { profile } = useProfile();
  const [state, setState] = useState<Omit<PlanAccess, "loading">>({
    isPremium: false,
    appointmentsUsed: 0,
    appointmentsCap: 0,
    nearCap: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;

    supabase.rpc("get_appointment_cap_usage", { _doctor_id: profile.id }).then(({ data }) => {
      if (cancelled) return;
      const row = data?.[0];
      const isPremium = row?.is_premium ?? false;
      const appointmentsUsed = row?.appointments_used ?? 0;
      const appointmentsCap = row?.appointments_cap ?? 0;
      const nearCap = !isPremium && appointmentsCap > 0 && appointmentsUsed / appointmentsCap >= NEAR_CAP_THRESHOLD;
      setState({ isPremium, appointmentsUsed, appointmentsCap, nearCap });
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  return { ...state, loading };
}
