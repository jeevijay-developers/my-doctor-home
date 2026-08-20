import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function usePlatformSettings() {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    try {
      const query = supabase?.from?.("platform_settings")?.select?.("*");
      if (query && typeof query.then === "function") {
        query
          .then(({ data }: any) => {
            if (!mounted) return;
            setSettings(Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value])));
            setLoading(false);
          })
          .catch(() => {
            if (mounted) setLoading(false);
          });
      } else {
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }

    try {
      const ch = supabase?.channel?.(`platform_settings_${Math.random().toString(36).slice(2)}`);
      if (ch && typeof ch.on === "function") {
        ch.on("postgres_changes", { event: "*", schema: "public", table: "platform_settings" }, () => {
          try {
            supabase?.from?.("platform_settings")?.select?.("*")?.then?.(({ data }: any) => {
              if (mounted) setSettings(Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value])));
            });
          } catch {}
        }).subscribe?.();

        return () => {
          mounted = false;
          try {
            supabase?.removeChannel?.(ch);
          } catch {}
        };
      }
    } catch {}

    return () => {
      mounted = false;
    };
  }, []);

  return { settings, loading };
}
