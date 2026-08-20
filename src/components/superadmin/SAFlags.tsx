import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { logAdminAction } from "@/lib/adminAudit";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { IndianRupee } from "lucide-react";
import { FALLBACK_PLAN_PRICES } from "@/hooks/usePlanPrices";

const SAFlags = () => {
  const [maintenance, setMaintenance] = useState(false);
  const [banner, setBanner] = useState("");
  const [trialDays, setTrialDays] = useState(7);

  // Plan pricing state
  const [proPrice, setProPrice] = useState<number>(FALLBACK_PLAN_PRICES.pro);
  const [premiumPrice, setPremiumPrice] = useState<number>(FALLBACK_PLAN_PRICES.premium);
  const [proInput, setProInput] = useState("");
  const [premiumInput, setPremiumInput] = useState("");
  const [savedProPrice, setSavedProPrice] = useState<number>(FALLBACK_PLAN_PRICES.pro);
  const [savedPremiumPrice, setSavedPremiumPrice] = useState<number>(FALLBACK_PLAN_PRICES.premium);
  const [pricingConfirmOpen, setPricingConfirmOpen] = useState(false);
  const [savingPricing, setSavingPricing] = useState(false);

  useEffect(() => {
    supabase.from("platform_settings").select("*").then(({ data }) => {
      const map = Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]));
      setMaintenance(map.maintenance_mode === true);
      setBanner(typeof map.announcement_banner === "string" ? map.announcement_banner : "");
      setTrialDays(Number(map.default_trial_days) || 7);

      const pro = map.pro_default_price != null ? Number(map.pro_default_price) : FALLBACK_PLAN_PRICES.pro;
      const premium = map.premium_default_price != null ? Number(map.premium_default_price) : FALLBACK_PLAN_PRICES.premium;
      setProPrice(pro);
      setPremiumPrice(premium);
      setSavedProPrice(pro);
      setSavedPremiumPrice(premium);
      setProInput(String(pro));
      setPremiumInput(String(premium));
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

  const openPricingConfirm = () => {
    const newPro = Number(proInput);
    const newPremium = Number(premiumInput);
    if (!Number.isFinite(newPro) || newPro < 1) {
      toast({ title: "Invalid Pro price", description: "Price must be a positive number.", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(newPremium) || newPremium < 1) {
      toast({ title: "Invalid Premium price", description: "Price must be a positive number.", variant: "destructive" });
      return;
    }
    setPricingConfirmOpen(true);
  };

  const confirmSavePricing = async () => {
    const newPro = Number(proInput);
    const newPremium = Number(premiumInput);
    setSavingPricing(true);

    const now = new Date().toISOString();
    const { error: e1 } = await supabase
      .from("platform_settings")
      .upsert({ key: "pro_default_price", value: newPro as any, updated_at: now });
    const { error: e2 } = await supabase
      .from("platform_settings")
      .upsert({ key: "premium_default_price", value: newPremium as any, updated_at: now });

    if (e1 || e2) {
      toast({ title: "Failed to save prices", description: (e1 ?? e2)?.message, variant: "destructive" });
      setSavingPricing(false);
      setPricingConfirmOpen(false);
      return;
    }

    await logAdminAction("update_plan_pricing", "platform_settings", undefined, {
      pro: { old: savedProPrice, new: newPro },
      premium: { old: savedPremiumPrice, new: newPremium },
    });

    setSavedProPrice(newPro);
    setSavedPremiumPrice(newPremium);
    setProPrice(newPro);
    setPremiumPrice(newPremium);
    setSavingPricing(false);
    setPricingConfirmOpen(false);
    toast({ title: "Plan prices updated", description: `Pro: ₹${newPro}/mo · Premium: ₹${newPremium}/mo` });
  };

  const pricingChanged =
    Number(proInput) !== savedProPrice || Number(premiumInput) !== savedPremiumPrice;

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

      {/* ── Plan Pricing ─────────────────────────────────────────────────────── */}
      <Card className="border-amber-500/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <IndianRupee className="h-4 w-4 text-amber-500" />
            Plan Pricing
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Set the platform-wide default monthly price for Pro and Premium. Doctors with a custom price override are unaffected.
            Changes apply to <strong>all future purchases and renewals</strong> from the moment you save.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Pro (₹/month)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                <Input
                  id="pro-price-input"
                  type="number"
                  min={1}
                  step={1}
                  className="pl-7"
                  value={proInput}
                  onChange={(e) => setProInput(e.target.value)}
                />
              </div>
              {savedProPrice !== Number(proInput) && Number(proInput) > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">Current: ₹{savedProPrice}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Premium (₹/month)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                <Input
                  id="premium-price-input"
                  type="number"
                  min={1}
                  step={1}
                  className="pl-7"
                  value={premiumInput}
                  onChange={(e) => setPremiumInput(e.target.value)}
                />
              </div>
              {savedPremiumPrice !== Number(premiumInput) && Number(premiumInput) > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">Current: ₹{savedPremiumPrice}</p>
              )}
            </div>
          </div>

          <Button
            size="sm"
            onClick={openPricingConfirm}
            disabled={!pricingChanged}
            className="mt-1"
          >
            Save Plan Prices
          </Button>
        </CardContent>
      </Card>

      {/* ── Pricing confirmation dialog ───────────────────────────────────────── */}
      <AlertDialog open={pricingConfirmOpen} onOpenChange={(o) => !savingPricing && setPricingConfirmOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm platform-wide price change</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  This will update the <strong>default price charged to every doctor</strong> on their next purchase or renewal.
                  Doctors with a custom price override will not be affected.
                </p>
                <div className="rounded-lg border bg-muted/50 p-3 space-y-1.5 text-sm">
                  {Number(proInput) !== savedProPrice && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pro</span>
                      <span>
                        <span className="line-through text-muted-foreground mr-2">₹{savedProPrice}</span>
                        <span className="font-semibold text-foreground">₹{Number(proInput)}</span>
                      </span>
                    </div>
                  )}
                  {Number(premiumInput) !== savedPremiumPrice && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Premium</span>
                      <span>
                        <span className="line-through text-muted-foreground mr-2">₹{savedPremiumPrice}</span>
                        <span className="font-semibold text-foreground">₹{Number(premiumInput)}</span>
                      </span>
                    </div>
                  )}
                </div>
                <p className="text-amber-600 dark:text-amber-400 text-xs font-medium">
                  ⚠ This change is logged to the Audit Log and takes effect immediately.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingPricing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSavePricing} disabled={savingPricing}>
              {savingPricing ? "Saving…" : "Confirm & Save"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SAFlags;
