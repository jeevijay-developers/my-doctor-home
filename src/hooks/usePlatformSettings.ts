import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function usePlatformSettings() {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.from("platform_settings").select("*").then(({ data }) => {
      if (!mounted) return;
      setSettings(Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value])));
      setLoading(false);
    });
    const ch = supabase.channel("platform_settings")
      .on("postgres_changes", { event: "*", schema: "public", table: "platform_settings" }, () => {
        supabase.from("platform_settings").select("*").then(({ data }) => {
          if (mounted) setSettings(Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value])));
        });
      }).subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, []);

  return { settings, loading };
}
