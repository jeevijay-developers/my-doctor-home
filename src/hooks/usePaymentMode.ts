import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Mirrors supabase/functions/_shared/paymentMode.ts's resolution — fetched
// once so UI (booking widget, Bank/UPI Setup, Super Admin Payments) can show
// a "TEST MODE" badge proactively, before any order is ever created.
export const usePaymentMode = () => {
  const [mode, setMode] = useState<"mock" | "live" | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.functions.invoke("get-payment-mode").then(({ data }) => {
      if (!cancelled && (data?.mode === "mock" || data?.mode === "live")) setMode(data.mode);
    });
    return () => { cancelled = true; };
  }, []);

  return { mode, isMock: mode === "mock" };
};
