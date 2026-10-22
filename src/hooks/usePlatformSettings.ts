import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type SettingRow = { key: string; value: unknown };

const toSettingsMap = (rows: SettingRow[] | null | undefined) =>
  Object.fromEntries((rows ?? []).map((r) => [r.key, r.value])) as Record<string, unknown>;

const CACHE_TTL_MS = 60_000;
let cachedSettings: { value: Record<string, unknown>; expiresAt: number } | null = null;
let inFlightSettingsPromise: Promise<Record<string, unknown> | null> | null = null;

export function usePlatformSettings() {
  const [settings, setSettings] = useState<Record<string, unknown>>(() =>
    cachedSettings && cachedSettings.expiresAt > Date.now() ? cachedSettings.value : {}
  );
  const [loading, setLoading] = useState<boolean>(
    () => !(cachedSettings && cachedSettings.expiresAt > Date.now())
  );

  useEffect(() => {
    let mounted = true;

    if (cachedSettings && cachedSettings.expiresAt > Date.now()) {
      setSettings(cachedSettings.value);
      setLoading(false);
    } else {
      // `supabase` may be partially mocked in tests, so every call is guarded.
      if (!inFlightSettingsPromise) {
        try {
          const query = supabase?.from?.("platform_settings")?.select?.("*");
          if (query && typeof query.then === "function") {
            inFlightSettingsPromise = Promise.resolve(query)
              .then(({ data }) => {
                const mapped = toSettingsMap(data);
                cachedSettings = { value: mapped, expiresAt: Date.now() + CACHE_TTL_MS };
                return mapped;
              })
              .catch(() => null)
              .finally(() => {
                inFlightSettingsPromise = null;
              });
          }
        } catch {
          inFlightSettingsPromise = null;
        }
      }

      if (inFlightSettingsPromise) {
        inFlightSettingsPromise.then((mapped) => {
          if (!mounted) return;
          if (mapped) setSettings(mapped);
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    }

    try {
      const ch = supabase?.channel?.(`platform_settings_${Math.random().toString(36).slice(2)}`);
      if (ch && typeof ch.on === "function") {
        ch.on("postgres_changes", { event: "*", schema: "public", table: "platform_settings" }, () => {
          try {
            supabase?.from?.("platform_settings")?.select?.("*")?.then?.(({ data }) => {
              const mapped = toSettingsMap(data);
              cachedSettings = { value: mapped, expiresAt: Date.now() + CACHE_TTL_MS };
              if (mounted) setSettings(mapped);
            });
          } catch {
            // Ignore refresh failures; the next realtime event will retry.
          }
        }).subscribe?.();

        return () => {
          mounted = false;
          try {
            supabase?.removeChannel?.(ch);
          } catch {
            // Channel already torn down.
          }
        };
      }
    } catch {
      // Realtime unavailable (e.g. mocked client); fall through to cleanup.
    }

    return () => {
      mounted = false;
    };
  }, []);

  return { settings, loading };
}
