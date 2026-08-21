import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Mirrors supabase/functions/_shared/paymentMode.ts's resolution — fetched
// once so UI (booking widget, Bank/UPI Setup, Super Admin Payments) can show
// a "TEST MODE" badge proactively, before any order is ever created.
export const usePaymentMode = () => {
  const [mode, setMode] = useState<"mock" | "live" | null>(null);

  useEffect(() => {
    let cancelled = false;
    try {
      const res = supabase?.functions?.invoke?.("get-payment-mode");
      if (res && typeof res.then === "function") {
        res
          .then(({ data }: any) => {
            if (!cancelled && (data?.mode === "mock" || data?.mode === "live")) setMode(data.mode);
          })
          .catch(() => {});
      }
    } catch {}
    return () => {
      cancelled = true;
    };
  }, []);

  return { mode, isMock: mode === "mock" };
};
