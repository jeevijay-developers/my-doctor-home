import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { Settings, Crown, Shield, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { differenceInDays } from "date-fns";
import { usePlanAccess } from "@/hooks/usePlanAccess";
import RequestUpgradeDialog from "./RequestUpgradeDialog";
import { getSubscriptionCardStates, getTierFeatures, TIER_LABELS, TIER_PRICES, TIER_TAGLINES, DEFAULT_APPOINTMENT_CAP } from "@/lib/planFeatures";

const SettingsPage = () => {
  const { profile } = useProfile();
  const [exporting, setExporting] = useState(false);

  const exportAllData = async () => {
    if (!profile) return;
    setExporting(true);
    try {
      const doctorId = profile.id;
      const tables = [
        "services", "packages", "working_hours", "appointments",
        "patients", "reviews", "blog_posts", "invoices", "website_settings",
      ] as const;
      const results: Record<string, any> = { profile };
      for (const t of tables) {
        const { data } = await (supabase.from(t as any) as any).select("*").eq("doctor_id", doctorId);
        results[t] = data || [];
      }
      const blob = new Blob([JSON.stringify(results, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = (profile.full_name || "doctor").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      a.download = `doctylia-full-export-${safeName}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Data export downloaded");
    } catch (e: any) {
      toast.error("Export failed: " + (e?.message || "unknown error"));
    } finally {
      setExporting(false);
    }
  };

  const daysLeft = profile?.trial_end ? Math.max(0, differenceInDays(new Date(profile.trial_end), new Date())) : 7;
  const trialProgress = ((7 - daysLeft) / 7) * 100;

  const { isPremium, appointmentsCap } = usePlanAccess();
  const planTier = profile?.plan_tier || "free";
  const planStatus = profile?.plan_status || "trial";
  const { basic, premium } = getSubscriptionCardStates(planStatus, planTier, isPremium);
  const basicFeatures = getTierFeatures("pro", appointmentsCap || DEFAULT_APPOINTMENT_CAP);
  const premiumFeatures = getTierFeatures("premium", appointmentsCap || DEFAULT_APPOINTMENT_CAP);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="font-heading font-bold text-2xl text-primary flex items-center gap-2">
        <Settings className="h-6 w-6 text-muted-foreground" /> Settings
      </h1>
      <p className="text-sm text-muted-foreground -mt-4">
        Manage subscription and account preferences. Edit your profile from the <a href="/admin/profile" className="text-royal hover:underline">Profile</a> section.
      </p>

      <Tabs defaultValue="subscription" className="space-y-6">
        <TabsList className="bg-card border border-border h-11">
          <TabsTrigger value="subscription" className="gap-1.5"><Crown className="h-3.5 w-3.5" /> Subscription</TabsTrigger>
          <TabsTrigger value="account" className="gap-1.5"><Shield className="h-3.5 w-3.5" /> Account</TabsTrigger>
        </TabsList>


        <TabsContent value="subscription">
          <Card className="border-border/60 shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Crown className="h-5 w-5 text-warning" /> Subscription</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-xl bg-secondary p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <Badge variant="secondary" className="capitalize text-sm font-semibold mb-2 bg-royal/10 text-royal">
                      {profile?.plan_status || "trial"} Plan
                    </Badge>
                    {profile?.plan_status === "trial" && (
                      <p className="text-sm text-muted-foreground mt-1">{daysLeft} day{daysLeft !== 1 ? "s" : ""} remaining in free trial</p>
                    )}
                  </div>
                </div>
                {profile?.plan_status === "trial" && (
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                      <span>Trial Progress</span>
                      <span>{Math.round(trialProgress)}%</span>
                    </div>
                    <Progress value={trialProgress} className="h-2.5 bg-border [&>div]:bg-royal" />
                  </div>
                )}
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className={`rounded-xl p-5 relative ${basic.isCurrent ? "border-2 border-royal" : "border border-border"}`}>
                  {basic.badge && (
                    <Badge className={`absolute -top-2.5 right-4 text-[10px] ${basic.isCurrent ? "bg-royal text-white" : "bg-secondary text-muted-foreground"}`}>
                      {basic.badge}
                    </Badge>
                  )}
                  <h3 className="font-heading font-bold text-foreground mb-1">{TIER_LABELS.pro}</h3>
                  <p className="text-xs text-muted-foreground">{TIER_TAGLINES.pro}</p>
                  <p className="text-sm text-muted-foreground mb-3">₹{TIER_PRICES.pro}/month</p>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    {basicFeatures.map(f => (
                      <li key={f} className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-royal" />{f}
                      </li>
                    ))}
                  </ul>
                  {basic.showCta && (
                    <RequestUpgradeDialog
                      targetTier="pro"
                      trigger={<Button size="sm" className="w-full mt-4 bg-royal hover:bg-royal/90">Request Upgrade</Button>}
                    />
                  )}
                </div>
                <div className={`rounded-xl p-5 relative ${premium.isCurrent ? "border-2 border-royal" : "border border-border"}`}>
                  {premium.badge && (
                    <Badge className={`absolute -top-2.5 right-4 text-[10px] ${premium.isCurrent ? "bg-royal text-white" : "bg-secondary text-muted-foreground"}`}>
                      {premium.badge}
                    </Badge>
                  )}
                  <h3 className="font-heading font-bold text-foreground mb-1">{TIER_LABELS.premium}</h3>
                  <p className="text-xs text-muted-foreground">{TIER_TAGLINES.premium}</p>
                  <p className="text-sm text-muted-foreground mb-3">₹{TIER_PRICES.premium}/month</p>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    {premiumFeatures.map(f => (
                      <li key={f} className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-royal" />{f}
                      </li>
                    ))}
                  </ul>
                  {premium.showCta && (
                    <RequestUpgradeDialog
                      targetTier="premium"
                      trigger={<Button size="sm" className="w-full mt-4 bg-royal hover:bg-royal/90">Request Upgrade</Button>}
                    />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="account">
          <div className="space-y-6">
            <Card className="border-border/60 shadow-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Download className="h-5 w-5 text-royal" /> Export Data</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">Download a full JSON snapshot of your profile, patients, appointments, invoices, blog and website data.</p>
                <Button variant="outline" onClick={exportAllData} disabled={exporting}>
                  <Download className="h-4 w-4 mr-2" /> {exporting ? "Preparing…" : "Export All Data"}
                </Button>
              </CardContent>
            </Card>

            <Card className="border-destructive/30 shadow-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive"><Trash2 className="h-5 w-5" /> Danger Zone</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">Permanently delete your account and all associated data. This action cannot be undone.</p>
                <Button variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/5" onClick={() => toast.info("Please contact support to delete your account.")}>
                  <Trash2 className="h-4 w-4 mr-2" /> Delete Account
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SettingsPage;
