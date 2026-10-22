import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const CACHE_TTL_MS = 60_000;
let cachedMode: { value: "mock" | "live"; expiresAt: number } | null = null;
let inFlightPromise: Promise<"mock" | "live" | null> | null = null;

// Mirrors usePaymentMode.ts exactly, against get-notification-mode instead.
export const useNotificationMode = () => {
  const [mode, setMode] = useState<"mock" | "live" | null>(() =>
    cachedMode && cachedMode.expiresAt > Date.now() ? cachedMode.value : null
  );

  useEffect(() => {
    let cancelled = false;
    if (cachedMode && cachedMode.expiresAt > Date.now()) {
      setMode(cachedMode.value);
      return;
    }

    if (!inFlightPromise) {
      try {
        const res = supabase?.functions?.invoke?.("get-notification-mode");
        if (res && typeof res.then === "function") {
          inFlightPromise = Promise.resolve(res)
            .then(({ data }: any) => {
              const resolved = data?.mode === "mock" || data?.mode === "live" ? data.mode : null;
              if (resolved) {
                cachedMode = { value: resolved, expiresAt: Date.now() + CACHE_TTL_MS };
              }
              return resolved;
            })
            .catch(() => null)
            .finally(() => {
              inFlightPromise = null;
            });
        }
      } catch {
        inFlightPromise = null;
      }
    }

    if (inFlightPromise) {
      inFlightPromise.then((resolved) => {
        if (!cancelled && resolved) setMode(resolved);
      });
    }

    return () => {
      cancelled = true;
    };
  }, []);

  return { mode, isMock: mode === "mock" };
};
