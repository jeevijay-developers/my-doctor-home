import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ImportAccess } from "@/lib/patientImportApi";

// Reads what the Import dialog may offer. This is for display only; import_patients decides
// again on the server, so a stale answer here can never let anything through.
export function usePatientImportAccess(enabled: boolean) {
  const [access, setAccess] = useState<ImportAccess | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  // Each request gets a number; only the newest may update state, and disabling or unmounting
  // retires every request still in flight.
  const latest = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++latest.current;
    setLoading(true);
    let next: ImportAccess | null = null;
    try {
      const { data, error } = await supabase.rpc("get_patient_import_access" as any);
      if (!error && data && typeof data === "object") next = data as unknown as ImportAccess;
    } catch {
      next = null;
    }
    if (id !== latest.current) return;
    // A failed refresh keeps the last good answer, so an open preview or error message survives a network blip.
    if (next) {
      setAccess(next);
      setFailed(false);
    } else {
      setFailed(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (enabled) void refresh();
    else {
      latest.current++;
      setLoading(false);
      // Forget the last answer, so reopening shows "checking" rather than an old plan state.
      setAccess(null);
      setFailed(false);
    }
    return () => {
      latest.current++;
    };
  }, [enabled, refresh]);

  // Only a failure with nothing good to show counts; otherwise the last good answer stays in use.
  return { access, loading, failed: failed && !access, refresh };
}
