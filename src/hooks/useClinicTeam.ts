import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PublicPractitioner } from "@/lib/practitioners/types";

/**
 * The clinic's active doctors for public pages, fetched lazily and best-effort:
 * stays null (clinic byline) while disabled, loading, or if the call fails.
 */
export function useClinicTeam(clinicId: string | null | undefined, enabled: boolean): PublicPractitioner[] | null {
  const [team, setTeam] = useState<PublicPractitioner[] | null>(null);
  useEffect(() => {
    // A different clinic must never show the previous clinic's doctors.
    setTeam(null);
    if (!clinicId || !enabled) return;
    let active = true;
    (async () => {
      try {
        const res = await supabase.rpc("get_public_practitioners", { _doctor_id: clinicId });
        if (!active || res?.error || !Array.isArray(res?.data)) return;
        setTeam(res.data as unknown as PublicPractitioner[]);
      } catch {
        /* best-effort */
      }
    })();
    return () => { active = false; };
  }, [clinicId, enabled]);
  return team;
}
