import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { logAdminAction } from "@/lib/adminAudit";

const SAFlags = () => {
  const [maintenance, setMaintenance] = useState(false);
  const [banner, setBanner] = useState("");
  const [trialDays, setTrialDays] = useState(7);

  useEffect(() => {
    supabase.from("platform_settings").select("*").then(({ data }) => {
      const map = Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]));
      setMaintenance(map.maintenance_mode === true);
      setBanner(typeof map.announcement_banner === "string" ? map.announcement_banner : "");
      setTrialDays(Number(map.default_trial_days) || 7);
    });
  }, []);

  const save = async (key: string, value: any, action: string) => {
    if (key === "default_trial_days" && (Number(value) < 1 || !Number.isFinite(Number(value)))) {
      toast({ title: "Invalid trial days", description: "Trial days must be at least 1.", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("platform_settings").upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    await logAdminAction(action, "platform_settings", undefined, { key, value });
    toast({ title: "Setting saved" });
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <Card>
        <CardHeader><CardTitle className="text-base">Maintenance Mode</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Show a maintenance screen to all doctors and patients (Super Admin routes stay accessible).</p>
          <Switch checked={maintenance} onCheckedChange={(v) => { setMaintenance(v); save("maintenance_mode", v, "toggle_maintenance"); }} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Announcement Banner</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Input value={banner} onChange={(e) => setBanner(e.target.value)} placeholder="Leave empty to hide banner" />
          <Button size="sm" onClick={() => save("announcement_banner", banner, "update_banner")}>Save banner</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Default Trial Days</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Input type="number" min={1} value={trialDays} onChange={(e) => setTrialDays(Number(e.target.value))} className="max-w-[120px]" />
          <p className="text-xs text-muted-foreground">Note: this is displayed/tracked here, but the DB default is fixed at 7 days. Changing the actual trial length for new signups requires a follow-up migration.</p>
          <Button size="sm" onClick={() => save("default_trial_days", trialDays, "update_trial_days")}>Save</Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default SAFlags;
