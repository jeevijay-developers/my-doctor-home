import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Mirrors usePaymentMode.ts exactly, against get-notification-mode instead.
export const useNotificationMode = () => {
  const [mode, setMode] = useState<"mock" | "live" | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.functions.invoke("get-notification-mode").then(({ data }) => {
      if (!cancelled && (data?.mode === "mock" || data?.mode === "live")) setMode(data.mode);
    });
    return () => { cancelled = true; };
  }, []);

  return { mode, isMock: mode === "mock" };
};
