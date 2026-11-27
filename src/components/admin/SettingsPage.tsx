import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { Settings, Crown, Shield, Trash2, UserCircle, CalendarClock, RotateCcw, Stethoscope, IndianRupee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { usePlanAccess } from "@/hooks/usePlanAccess";
import { usePlanPrices, planPricesToRecord } from "@/hooks/usePlanPrices";
import UpgradeCheckoutDialog from "./UpgradeCheckoutDialog";
import { getSubscriptionCardStates, getTierFeatures, TIER_LABELS, TIER_PRICES, getDoctorTierPrice, TIER_TAGLINES, DEFAULT_APPOINTMENT_CAP, hasNoActivePlan } from "@/lib/planFeatures";
import { formatIstDate } from "@/lib/istDate";
import ProfilePage from "./ProfilePage";
import DeleteAccountDialog from "./DeleteAccountDialog";
import CustomPlanSection from "./CustomPlanSection";
import { useCustomPlan } from "@/hooks/useCustomPlan";
import { applyCustomPlanToBullets } from "@/lib/customPlan";
import { usePractitioners } from "@/hooks/usePractitioners";
import MyDoctorDetailsCard from "./MyDoctorDetailsCard";
import { practitionerErrorMessage } from "@/lib/practitioners/errors";

type ClinicalVisibility = "shared" | "treating";

// Multi-doctor clinics only, owner only: who among the clinic's doctors can open a
// patient's clinical records. The database refuses anyone but the owner (OWNER_ONLY).
const ClinicalVisibilityCard = ({ clinicId }: { clinicId: string }) => {
  const [saved, setSaved] = useState<ClinicalVisibility | null>(null);
  const [value, setValue] = useState<ClinicalVisibility>("shared");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("website_settings")
      .select("clinical_visibility")
      .eq("doctor_id", clinicId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const v: ClinicalVisibility = (data as { clinical_visibility?: string } | null)?.clinical_visibility === "treating" ? "treating" : "shared";
        setSaved(v);
        setValue(v);
      });
    return () => { cancelled = true; };
  }, [clinicId]);

  const save = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("website_settings")
        .update({ clinical_visibility: value })
        .eq("doctor_id", clinicId);
      if (error) {
        toast.error(practitionerErrorMessage(error.message) ?? "Could not save. Please try again.");
        return;
      }
      setSaved(value);
      toast.success("Doctors' access to records updated.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Card className="border-border/60 shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Stethoscope className="h-5 w-5 text-royal" /> Doctors' access to records</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <RadioGroup value={value} onValueChange={(v) => setValue(v as ClinicalVisibility)} disabled={saved === null || saving} className="space-y-2">
          <div className="flex items-start gap-2.5">
            <RadioGroupItem value="shared" id="cv-shared" className="mt-0.5" />
            <Label htmlFor="cv-shared" className="font-normal leading-snug">
              <span className="font-medium">Shared:</span> every doctor sees every patient's records (recommended)
            </Label>
          </div>
          <div className="flex items-start gap-2.5">
            <RadioGroupItem value="treating" id="cv-treating" className="mt-0.5" />
            <Label htmlFor="cv-treating" className="font-normal leading-snug">
              <span className="font-medium">Own patients only:</span> doctor logins see prescriptions, visits, documents and medical history only for patients they have treated or authored records for. This limits what doctors see in the app; it is not a security audit log, and appointment lists remain visible to all clinic staff.
            </Label>
          </div>
        </RadioGroup>
        <p className="text-xs text-muted-foreground">
          Allergies and history always remain visible to the treating doctor.
        </p>
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={saved === null || saving || value === saved} className="bg-royal hover:bg-royal/90">
            {saving ? "Saving…" : "Save access"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// Multi-doctor clinics, owner only: lets each doctor login see their own aggregate totals on the
// dashboard. Off by default; the database refuses anyone but the owner (OWNER_ONLY).
const DoctorEarningsCard = ({ clinicId }: { clinicId: string }) => {
  const [value, setValue] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  // The current value could not be read: show that, never a guessed OFF the owner might then act on.
  const [loadFailed, setLoadFailed] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoadFailed(false);
    supabase
      .from("website_settings")
      .select("show_doctor_earnings")
      .eq("doctor_id", clinicId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) { setLoadFailed(true); return; }
        setValue((data as { show_doctor_earnings?: boolean }).show_doctor_earnings === true);
      }, () => { if (!cancelled) setLoadFailed(true); });
    return () => { cancelled = true; };
  }, [clinicId]);

  const change = async (next: boolean) => {
    if (savingRef.current || value === null) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const { data: written, error } = await supabase
        .from("website_settings")
        .update({ show_doctor_earnings: next })
        .eq("doctor_id", clinicId)
        .select("doctor_id");
      if (error) {
        toast.error(practitionerErrorMessage(error.message) ?? "Could not save. Please try again.");
        return;
      }
      // Row-level security can turn a refused write into zero changed rows with no error.
      if (!written || written.length === 0) {
        toast.error("Could not save. Please try again.");
        return;
      }
      setValue(next);
      toast.success(next ? "Doctors can now see their own earnings." : "Doctors can no longer see earnings.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Card className="border-border/60 shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><IndianRupee className="h-5 w-5 text-royal" /> Doctors' earnings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-3">
          <Switch
            id="show-doctor-earnings"
            checked={value === true}
            disabled={value === null || saving || loadFailed}
            onCheckedChange={change}
            aria-label="Let each doctor see their own earnings"
            className="mt-0.5"
          />
          <Label htmlFor="show-doctor-earnings" className="font-normal leading-snug">
            Let each doctor see their own earnings
          </Label>
        </div>
        <p className="text-xs text-muted-foreground">
          Doctors see only their own totals — no patient names or other doctors' numbers.
        </p>
        {loadFailed && (
          <p role="alert" className="text-xs text-destructive">Couldn't load this setting. Reload the page to try again.</p>
        )}
      </CardContent>
    </Card>
  );
};

const SettingsPage = () => {
  const { profile, isStaff, role } = useProfile();
  const { isMulti } = usePractitioners();
  const { proPrice: liveProPrice, premiumPrice: livePremiumPrice } = usePlanPrices();
  const livePrices = planPricesToRecord({ proPrice: liveProPrice, premiumPrice: livePremiumPrice });
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");

  const [pendingPlan, setPendingPlan] = useState<any>(null);
  const [cancellingScheduled, setCancellingScheduled] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (!profile?.id) return;
    supabase
      .from("pending_plans" as any)
      .select("id, target_tier, activation_date, payment_id, created_at, plan_upgrade_payments(amount, status)")
      .eq("doctor_id", profile.id)
      .maybeSingle()
      .then(({ data }) => {
        setPendingPlan(data);
      });
  }, [profile?.id]);

  const handleCancelScheduledPlan = async () => {
    if (!pendingPlan) return;
    setCancellingScheduled(true);
    try {
      const { data, error } = await supabase.functions.invoke("cancel-scheduled-plan", {
        body: { pending_plan_id: pendingPlan.id },
      });
      if (error || !data?.ok) {
        toast.error(error?.message || data?.error || "Could not cancel scheduled plan");
        return;
      }
      toast.success(data?.message || "Scheduled plan cancelled.");
      setPendingPlan(null);
      setTimeout(() => window.location.reload(), 1000);
    } catch (e: any) {
      toast.error("Failed to cancel: " + (e?.message || "Unknown error"));
    } finally {
      setCancellingScheduled(false);
    }
  };

  const daysLeft = profile?.trial_end ? Math.max(0, Math.ceil((new Date(profile.trial_end).getTime() - Date.now()) / 86400000)) : 0;
  const trialProgress = Math.min(100, Math.max(0, ((7 - daysLeft) / 7) * 100));

  const { isPremium, appointmentsCap, standardCap } = usePlanAccess();
  const planTier = profile?.plan_tier || "free";
  const planStatus = profile?.plan_status || "trial";
  const { basic, premium } = getSubscriptionCardStates(planStatus, planTier, isPremium);
  const { customPlan } = useCustomPlan();
  const basicFeatures = applyCustomPlanToBullets(getTierFeatures("pro", standardCap || appointmentsCap || DEFAULT_APPOINTMENT_CAP), customPlan, "pro");
  const premiumFeatures = applyCustomPlanToBullets(getTierFeatures("premium", standardCap || appointmentsCap || DEFAULT_APPOINTMENT_CAP), customPlan, "premium");

  if (isStaff && role === "doctor") {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="font-heading font-bold text-2xl text-primary flex items-center gap-2">
          <Settings className="h-6 w-6 text-muted-foreground" /> Settings
        </h1>
        <MyDoctorDetailsCard />
      </div>
    );
  }

  if (isStaff) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="font-heading font-bold text-2xl text-primary flex items-center gap-2">
          <Settings className="h-6 w-6 text-muted-foreground" /> Settings
        </h1>
        <ProfilePage />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="font-heading font-bold text-2xl text-primary flex items-center gap-2">
        <Settings className="h-6 w-6 text-muted-foreground" /> Settings
      </h1>
      <p className="text-sm text-muted-foreground -mt-4">
        Manage your profile, subscription and account preferences.
      </p>

      <Tabs defaultValue={requestedTab === "subscription" || requestedTab === "account" ? requestedTab : "profile"} className="space-y-6">
        <TabsList className="bg-card border border-border h-11">
          <TabsTrigger value="profile" className="gap-1.5"><UserCircle className="h-3.5 w-3.5" /> Profile</TabsTrigger>
          <TabsTrigger value="subscription" className="gap-1.5"><Crown className="h-3.5 w-3.5" /> Subscription</TabsTrigger>
          <TabsTrigger value="account" className="gap-1.5"><Shield className="h-3.5 w-3.5" /> Account</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfilePage />
        </TabsContent>

        <TabsContent value="subscription">
          <Card className="border-border/60 shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Crown className="h-5 w-5 text-warning" /> Subscription</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-xl bg-secondary p-5">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                  <div>
                    <Badge variant="secondary" className="capitalize text-sm font-semibold mb-2 bg-royal/10 text-royal">
                      {profile?.plan_status || "trial"} Plan ({TIER_LABELS[planTier] || planTier})
                    </Badge>
                    {profile?.plan_status === "trial" && (
                      <p className="text-sm text-muted-foreground mt-1">{daysLeft} day{daysLeft !== 1 ? "s" : ""} remaining in free trial</p>
                    )}
                    {profile?.plan_status === "active" && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {profile?.plan_end ? (
                          <>
                            Active until{" "}
                            <span className="font-medium text-foreground">{formatIstDate(profile.plan_end)}</span>{" "}
                            ({Math.max(0, Math.ceil((new Date(profile.plan_end).getTime() - Date.now()) / 86400000))} days remaining)
                          </>
                        ) : (
                          "Your plan is active."
                        )}
                      </p>
                    )}
                    {profile?.plan_status === "expired" && (
                      <p className="text-sm text-destructive mt-1 font-medium">Your plan has expired. Renew to keep your plan features.</p>
                    )}
                    {profile?.plan_status === "cancelled" && (
                      <p className="text-sm text-destructive mt-1 font-medium">Your account is currently suspended. Please contact support.</p>
                    )}
                  </div>

                  {(hasNoActivePlan(planStatus) || planStatus === "expired") && planStatus !== "cancelled" && (
                    <div className="flex items-center gap-2">
                      <UpgradeCheckoutDialog
                        targetTier={planTier === "premium" ? "premium" : "pro"}
                        trigger={
                          <Button size="sm" className="bg-royal hover:bg-royal/90 font-semibold">
                            <RotateCcw className="h-4 w-4 mr-1.5" /> Reactivate Plan
                          </Button>
                        }
                      />
                    </div>
                  )}
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

              {pendingPlan && (
                <div className="rounded-xl border border-royal/30 bg-royal/5 p-5 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2.5">
                      <CalendarClock className="h-5 w-5 text-royal" />
                      <div>
                        <h4 className="font-heading font-bold text-foreground">Upcoming Scheduled Plan</h4>
                        <p className="text-xs text-muted-foreground">
                          Scheduled to start on {new Date(pendingPlan.activation_date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="bg-royal/10 text-royal border-royal/30 capitalize">
                      {TIER_LABELS[pendingPlan.target_tier] || pendingPlan.target_tier} Plan
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1 bg-card/70 rounded-lg p-3 border border-border/50">
                    <p>• Your current <strong>{TIER_LABELS[planTier] || planTier}</strong> plan remains active until {profile?.plan_end ? new Date(profile.plan_end).toLocaleDateString() : "period end"}.</p>
                    <p>• The new <strong>{TIER_LABELS[pendingPlan.target_tier] || pendingPlan.target_tier}</strong> plan will activate automatically on {new Date(pendingPlan.activation_date).toLocaleDateString()}.</p>
                    {pendingPlan.plan_upgrade_payments?.amount && (
                      <p>• Advance payment of ₹{pendingPlan.plan_upgrade_payments.amount} completed.</p>
                    )}
                  </div>
                  <div className="flex justify-end pt-1">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10 text-xs">
                          Cancel Scheduled Plan
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Cancel Scheduled Plan?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will cancel your upcoming {TIER_LABELS[pendingPlan.target_tier] || pendingPlan.target_tier} plan scheduled for {new Date(pendingPlan.activation_date).toLocaleDateString()}. Your payment will be marked for refund.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep Scheduled Plan</AlertDialogCancel>
                          <AlertDialogAction onClick={handleCancelScheduledPlan} disabled={cancellingScheduled} className="bg-destructive hover:bg-destructive/90 text-white">
                            {cancellingScheduled ? "Cancelling…" : "Confirm Cancellation"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              )}

              <CustomPlanSection />

              {(() => {
                const proPrice = getDoctorTierPrice("pro", profile, livePrices, customPlan);
                const premiumPrice = getDoctorTierPrice("premium", profile, livePrices, customPlan);
                const hasProCustom = (profile?.custom_plan_price != null || customPlan?.base_tier === "pro") && proPrice !== livePrices.pro;
                const hasPremiumCustom = (profile?.custom_plan_price != null || customPlan?.base_tier === "premium") && premiumPrice !== livePrices.premium;

                return (
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className={`rounded-xl p-5 relative flex flex-col justify-between ${basic.isCurrent ? "border-2 border-royal" : "border border-border"}`}>
                      <div>
                        {basic.badge && (
                          <Badge className={`absolute -top-2.5 right-4 text-[10px] ${basic.isCurrent ? "bg-royal text-white" : "bg-secondary text-muted-foreground"}`}>
                            {basic.badge}
                          </Badge>
                        )}
                        <h3 className="font-heading font-bold text-foreground mb-1">{TIER_LABELS.pro}</h3>
                        <p className="text-xs text-muted-foreground">{TIER_TAGLINES.pro}</p>
                        <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
                          ₹{proPrice}/month
                          {hasProCustom && (
                            <Badge variant="outline" className="text-[10px] bg-spark/15 text-spark border-spark/30 font-normal">Custom Price</Badge>
                          )}
                        </p>
                        <ul className="space-y-1.5 text-sm text-muted-foreground">
                          {basicFeatures.map(f => (
                            <li key={f.text} className={`flex items-center gap-2 ${f.kind === "removed" ? "line-through opacity-60" : ""}`}>
                              <div className={`w-1.5 h-1.5 rounded-full ${f.kind === "added" ? "bg-success" : f.kind === "removed" ? "bg-muted-foreground" : "bg-royal"}`} />{f.kind === "added" ? `+ ${f.text}` : f.text}
                            </li>
                          ))}
                        </ul>
                      </div>
                      {basic.showCta && (
                        <div className="pt-4 mt-auto">
                          <UpgradeCheckoutDialog
                            targetTier="pro"
                            trigger={<Button size="sm" className="w-full bg-royal hover:bg-royal/90">{basic.ctaLabel || "Upgrade Now"}</Button>}
                          />
                        </div>
                      )}
                    </div>
                    <div className={`rounded-xl p-5 relative flex flex-col justify-between ${premium.isCurrent ? "border-2 border-royal" : "border border-border"}`}>
                      <div>
                        {premium.badge && (
                          <Badge className={`absolute -top-2.5 right-4 text-[10px] ${premium.isCurrent ? "bg-royal text-white" : "bg-secondary text-muted-foreground"}`}>
                            {premium.badge}
                          </Badge>
                        )}
                        <h3 className="font-heading font-bold text-foreground mb-1">{TIER_LABELS.premium}</h3>
                        <p className="text-xs text-muted-foreground">{TIER_TAGLINES.premium}</p>
                        <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
                          ₹{premiumPrice}/month
                          {hasPremiumCustom && (
                            <Badge variant="outline" className="text-[10px] bg-spark/15 text-spark border-spark/30 font-normal">Custom Price</Badge>
                          )}
                        </p>
                        <ul className="space-y-1.5 text-sm text-muted-foreground">
                          {premiumFeatures.map(f => (
                            <li key={f.text} className={`flex items-center gap-2 ${f.kind === "removed" ? "line-through opacity-60" : ""}`}>
                              <div className={`w-1.5 h-1.5 rounded-full ${f.kind === "added" ? "bg-success" : f.kind === "removed" ? "bg-muted-foreground" : "bg-royal"}`} />{f.kind === "added" ? `+ ${f.text}` : f.text}
                            </li>
                          ))}
                        </ul>
                      </div>
                      {premium.showCta && (
                        <div className="pt-4 mt-auto">
                          <UpgradeCheckoutDialog
                            targetTier="premium"
                            trigger={<Button size="sm" className="w-full bg-royal hover:bg-royal/90">{premium.ctaLabel || "Upgrade Now"}</Button>}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="account">
          <div className="space-y-6">
            {isMulti && role === "owner" && profile?.id && <ClinicalVisibilityCard clinicId={profile.id} />}
            {isMulti && role === "owner" && profile?.id && <DoctorEarningsCard clinicId={profile.id} />}
            <Card className="border-destructive/30 shadow-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive"><Trash2 className="h-5 w-5" /> Danger Zone</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">Permanently delete your account and all associated data. This action cannot be undone.</p>
                {isStaff ? (
                  <p className="text-sm text-muted-foreground">Only the clinic owner can delete the account.</p>
                ) : (
                  <Button variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/5" onClick={() => setDeleteOpen(true)}>
                    <Trash2 className="h-4 w-4 mr-2" /> Delete Account
                  </Button>
                )}
                <DeleteAccountDialog open={deleteOpen} onOpenChange={setDeleteOpen} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SettingsPage;
