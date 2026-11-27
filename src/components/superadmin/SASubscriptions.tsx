import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { useSuperAdminAccess } from "@/contexts/SuperAdminAccessContext";
import { logAdminAction } from "@/lib/adminAudit";
import { Search, RotateCcw, Save, Trash2 } from "lucide-react";
import BulkDeleteDoctorsDialog from "./BulkDeleteDoctorsDialog";
import { usePlanPrices, planPricesToRecord } from "@/hooks/usePlanPrices";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { customPlanApplication, isCustomPlanActive, type CustomPlan } from "@/lib/customPlan";
import { classifyPlan, countByView, describeExpiry, matchesView, type ClassifiedPlan, type PlanView } from "@/lib/subscriptionView";
import { formatIstDate } from "@/lib/istDate";
import { paymentKindLabel } from "@/lib/subscriptionRevenue";

// Single source of truth lives in lib/planPrices; re-exported for existing importers.
import { getEffectivePlanPrice } from "@/lib/planPrices";
export { DEFAULT_PLAN_PRICES, getEffectivePlanPrice } from "@/lib/planPrices";

const tiers = ["pro", "premium"];

const VIEW_CARDS: { view: PlanView; label: string; hint: (p: { pro: number; premium: number }) => string; tone: string }[] = [
  { view: "all", label: "All doctors", hint: () => "every account", tone: "text-foreground" },
  { view: "pro", label: "Pro", hint: (p) => `active · default ₹${p.pro}`, tone: "text-primary" },
  { view: "premium", label: "Premium", hint: (p) => `active · default ₹${p.premium}`, tone: "text-primary" },
  { view: "custom", label: "Custom", hint: () => "negotiated price or plan", tone: "text-royal" },
  { view: "trial", label: "Free trial", hint: () => "trial running", tone: "text-warning" },
  { view: "expiring", label: "Expiring soon", hint: () => "ends within 7 days", tone: "text-warning" },
  { view: "expired", label: "Expired", hint: () => "plan or trial ended, or no plan", tone: "text-destructive" },
  { view: "suspended", label: "Suspended", hint: () => "account suspended", tone: "text-muted-foreground" },
];

const VIEW_LABEL: Record<PlanView, string> = Object.fromEntries(VIEW_CARDS.map((c) => [c.view, c.label])) as Record<PlanView, string>;

// Plan status for one doctor: the single badge that answers "is this plan live?"
function StatusBadge({ c }: { c: ClassifiedPlan }) {
  switch (c.bucket) {
    case "active_paid":
      return <Badge className="bg-success/15 text-success border border-success/30 hover:bg-success/15">Active</Badge>;
    case "trial":
      return <Badge variant="outline" className="border-warning/40 text-warning bg-warning/10">Trial</Badge>;
    case "expired":
      return <Badge className="bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/15">Expired</Badge>;
    case "suspended":
      return <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">Suspended</Badge>;
  }
}

const SASubscriptions = () => {
  const { can } = useSuperAdminAccess();
  const canManage = can("subscriptions.manage");
  const canDeleteDoctors = can("doctors.delete");
  const { proPrice, premiumPrice } = usePlanPrices();
  const livePrices = planPricesToRecord({ proPrice, premiumPrice });
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dates, setDates] = useState<Record<string, string>>({});
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [view, setView] = useState<PlanView>("all");
  const [sortBy, setSortBy] = useState<"joined" | "expiry">("joined");
  const [pendingTierChange, setPendingTierChange] = useState<{
    id: string; tier: string; prev: string; wasTrial: boolean; hasCustom: boolean; customPrice: number | null;
  } | null>(null);

  const [upgradePayments, setUpgradePayments] = useState<any[]>([]);
  const [pendingPlansMap, setPendingPlansMap] = useState<Record<string, any>>({});
  // Active approved custom plans (Plan Requests module), keyed by doctor. When
  // one applies it outranks the manual custom price, so show it here instead
  // of letting the two screens disagree.
  const [customPlansMap, setCustomPlansMap] = useState<Record<string, CustomPlan>>({});

  // Every row has a checkbox; the floating bar appears once something is ticked
  // (same flow as the Doctors module).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const load = () =>
    supabase.from("profiles").select("*").order("created_at", { ascending: false }).then(({ data, error }) => {
      setRows(data ?? []);
      setLoadError(error ? error.message : null);
      setLoading(false);
    });

  const loadUpgradePayments = () =>
    supabase
      .from("plan_upgrade_payments")
      .select("id, doctor_id, from_tier, target_tier, amount, status, is_mock, created_at, kind, seats_quantity, needs_refund, needs_refund_reason, profiles(full_name, clinic_name)")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (error) {
          toast({ title: "Failed to load upgrade payments", description: error.message, variant: "destructive" });
          return;
        }
        setUpgradePayments(data ?? []);
      });

  const loadPendingPlans = () =>
    supabase
      .from("pending_plans" as any)
      .select("id, doctor_id, target_tier, activation_date")
      .then(({ data }) => {
        const map: Record<string, any> = {};
        (data || []).forEach((item: any) => {
          map[item.doctor_id] = item;
        });
        setPendingPlansMap(map);
      });

  const loadCustomPlans = () =>
    supabase
      .from("doctor_custom_plans" as any)
      .select("*")
      .then(({ data }) => {
        const map: Record<string, CustomPlan> = {};
        ((data as unknown as CustomPlan[]) || []).forEach((p) => { if (isCustomPlanActive(p)) map[p.doctor_id] = p; });
        setCustomPlansMap(map);
      });

  useEffect(() => { load(); loadUpgradePayments(); loadPendingPlans(); loadCustomPlans(); }, []);

  // Everything below keys off this one classification, so the cards, the filter,
  // the Status column and the counts can never disagree.
  const classified = useMemo(() => {
    const now = new Date();
    return rows.map((r) => ({ row: r, c: classifyPlan(r, customPlansMap[r.id], now) }));
  }, [rows, customPlansMap]);
  const counts = useMemo(() => countByView(classified.map((x) => x.c)), [classified]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const list = classified.filter(({ row: r, c }) => {
      if (!matchesView(c, view)) return false;
      if (!q) return true;
      return (
        (r.full_name || "").toLowerCase().includes(q) ||
        (r.clinic_name || "").toLowerCase().includes(q) ||
        (r.email || "").toLowerCase().includes(q)
      );
    });
    if (sortBy === "expiry") {
      // Soonest end date first; doctors with no end date last.
      list.sort((a, b) => (a.c.endsAt?.getTime() ?? Infinity) - (b.c.endsAt?.getTime() ?? Infinity));
    }
    return list;
  }, [classified, debouncedSearch, view, sortBy]);

  const chooseView = (v: PlanView) => {
    setView(v);
    // The list people want for "expiring" / "expired" is ordered by date.
    setSortBy(v === "expiring" || v === "expired" ? "expiry" : "joined");
  };
  const filtersActive = view !== "all" || !!debouncedSearch || sortBy !== "joined";
  const resetFilters = () => { setView("all"); setSearch(""); setSortBy("joined"); };

  // Only rows on screen count as selected, so a bulk delete can never reach a
  // doctor hidden by the current filter.
  const selectedRows = filtered.filter(({ row }) => selectedIds.has(row.id));
  const allSelected = filtered.length > 0 && selectedRows.length === filtered.length;
  const someSelected = selectedRows.length > 0 && !allSelected;
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(filtered.map(({ row }) => row.id)));
  const bulkTargets = selectedRows.map(({ row }) => ({ id: row.id, full_name: row.full_name }));

  const requestTierChange = (id: string, tier: string, prev: string) => {
    const row = rows.find((r) => r.id === id);
    setPendingTierChange({
      id,
      tier,
      prev,
      wasTrial: row?.plan_status === "trial",
      hasCustom: row?.custom_plan_price != null,
      customPrice: row?.custom_plan_price ?? null,
    });
  };

  const applyTierChange = async (keepCustomPrice: boolean) => {
    if (!pendingTierChange || !canManage) return;
    const { id, tier, prev, wasTrial, hasCustom } = pendingTierChange;

    // Switching tier must not shorten or lengthen a paid period that is still
    // running; only start a fresh 30 days when there is none (trial/expired/no end).
    const current = rows.find((r) => r.id === id);
    const stillPaid = current?.plan_status === "active" && current?.plan_end && new Date(current.plan_end).getTime() > Date.now();
    const planEnd = stillPaid ? current!.plan_end! : new Date(Date.now() + 30 * 86400000).toISOString();
    const update: any = { plan_tier: tier, plan_status: "active", trial_end: null, plan_end: planEnd };
    if (hasCustom && !keepCustomPrice) update.custom_plan_price = null;

    const { data, error } = await supabase.from("profiles").update(update).eq("id", id).select("id");
    if (error || !data?.length) {
      toast({
        title: error ? "Failed" : "Not saved",
        description: error ? error.message : "No rows were changed. You may not have permission to edit this doctor.",
        variant: "destructive",
      });
      setPendingTierChange(null);
      return;
    }
    await logAdminAction("change_plan_tier", "profiles", id, {
      from: prev, to: tier, ended_trial: wasTrial, ...(hasCustom ? { kept_custom_price: keepCustomPrice } : {}),
    });
    toast({ title: "Tier updated", description: wasTrial ? "Trial ended — new tier applied immediately." : undefined });
    setPendingTierChange(null);
    load();
  };

  const extend = async (id: string) => {
    const d = dates[id];
    if (!d || !canManage) return;
    const row = rows.find((r) => r.id === id);
    if (!row) return;

    // "23:59:59Z" (UTC) is actually early-morning-next-day in IST, so a
    // doctor viewing their own timezone-local-formatted date would see one
    // day later than what the superadmin picked (and than the server-side,
    // UTC-formatted notification text shows). Anchor end-of-day to IST
    // (this platform's business timezone, no DST) so every rendering of
    // this instant — server or client, whatever viewer timezone — lands on
    // the calendar date actually picked here.
    const isoDate = new Date(`${d}T23:59:59+05:30`).toISOString();
    if (new Date(isoDate).getTime() <= Date.now()) {
      return toast({ title: "Pick a future date", description: "An expiry in the past would lock the doctor out immediately.", variant: "destructive" });
    }
    const updateData: any = {};

    // A free-tier doctor only ever has a trial to extend (an expired one included);
    // writing plan_end here would turn them into an "active free" account.
    const isTrialExtension = row.plan_status === "trial" || (row.plan_tier || "free") === "free";

    if (isTrialExtension) {
      updateData.trial_end = isoDate;
      // A suspended account stays suspended until support lifts it explicitly.
      if (row.plan_status !== "cancelled") updateData.plan_status = "trial";
    } else {
      updateData.plan_end = isoDate;
      // Extending revives an EXPIRED plan; a suspended ('cancelled') account stays
      // suspended until support lifts the suspension explicitly.
      if (row.plan_status === "expired") {
        updateData.plan_status = "active";
      }
    }

    const { data, error } = await supabase.from("profiles").update(updateData).eq("id", id).select("id");
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    if (!data?.length) return toast({ title: "Not saved", description: "No rows were changed. You may not have permission to edit this doctor.", variant: "destructive" });

    await logAdminAction(isTrialExtension ? "extend_trial" : "extend_subscription_expiry", "profiles", id, {
      new_expiry: isoDate,
      plan_status: row.plan_status,
      plan_tier: row.plan_tier,
    });

    toast({
      title: "Expiry date updated",
      description: isTrialExtension
        ? `Trial date set to ${d}.`
        : `${(row.plan_tier || "Plan").toUpperCase()} plan expiry date updated to ${d}. Plan remains active.`,
    });
    setDates((x) => ({ ...x, [id]: "" }));
    load();
  };

  const saveCustomPrice = async (id: string) => {
    if (!canManage) return;
    const raw = prices[id];
    if (raw === undefined || raw === "") {
      toast({ title: "Enter a price", description: "Type an amount or click Reset to remove the override.", variant: "destructive" });
      return;
    }
    const value = Number(raw);
    // Zero is refused: checkout cannot create a ₹0 Razorpay order, so a ₹0
    // price would block that doctor's next renewal. Use Reset to drop the override.
    if (!Number.isFinite(value) || value <= 0 || value > 100000) {
      toast({ title: "Invalid price", description: "Enter an amount above 0 and up to 1,00,000, or use Reset to remove the override.", variant: "destructive" });
      return;
    }

    const { data, error } = await supabase.from("profiles").update({ custom_plan_price: value }).eq("id", id).select("id");
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    if (!data?.length) return toast({ title: "Not saved", description: "No rows were changed. You may not have permission to edit this doctor.", variant: "destructive" });
    await logAdminAction("set_custom_price", "profiles", id, { custom_price: value });
    toast({ title: "Custom price saved", description: `Override set to ₹${value} for this doctor.` });
    setPrices((x) => ({ ...x, [id]: "" }));
    load();
  };

  const clearCustomPrice = async (id: string) => {
    if (!canManage) return;
    const { data, error } = await supabase.from("profiles").update({ custom_plan_price: null }).eq("id", id).select("id");
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    if (!data?.length) return toast({ title: "Not saved", description: "No rows were changed. You may not have permission to edit this doctor.", variant: "destructive" });
    await logAdminAction("clear_custom_price", "profiles", id, {});
    toast({ title: "Custom price reset", description: "Doctor reverted to standard plan pricing." });
    setPrices((x) => ({ ...x, [id]: "" }));
    load();
  };

  // ---- shared pieces (desktop table and mobile cards render the same controls) ----

  const emptyMessage = loadError
    ? `Could not load doctors: ${loadError}`
    : filtersActive ? "No doctors match these filters." : "No doctors yet.";

  const expiryCell = (c: ClassifiedPlan) => {
    if (!c.endsAt) return <span className="text-muted-foreground">—</span>;
    const rel = describeExpiry(c);
    const tone = c.bucket === "expired" ? "text-destructive" : c.expiringSoon ? "text-warning font-medium" : "text-muted-foreground";
    return (
      <>
        <div className="text-xs">{formatIstDate(c.endsAt)}</div>
        {rel && <div className={`text-[11px] ${tone}`}>{c.bucket === "expired" ? `ended ${rel}` : rel}</div>}
      </>
    );
  };

  const priceInfo = (r: any, tier: string) => {
    const hasCustom = r.custom_plan_price != null;
    const plan = customPlansMap[r.id];
    // An approved custom plan changes the price only while the doctor is on its base tier.
    const applies = customPlanApplication(plan, tier) === "applies";
    const mismatch = !!plan && !applies && customPlanApplication(plan, tier) === "tier_mismatch";
    const effective = applies ? Number(plan.monthly_price) : getEffectivePlanPrice(r);
    return { hasCustom, applies, mismatch, effective };
  };

  const priceBadge = (p: ReturnType<typeof priceInfo>) =>
    p.applies ? (
      <Badge className="mt-1 bg-royal/10 text-royal hover:bg-royal/10 border-royal/30 text-[10px]">Custom Plan (approved)</Badge>
    ) : p.hasCustom ? (
      <Badge className="mt-1 bg-spark/15 text-spark hover:bg-spark/15 border-spark/30 text-[10px]">Custom Pricing</Badge>
    ) : (
      <div className="text-[10px] text-muted-foreground mt-1">Default</div>
    );

  const mismatchNote = (p: ReturnType<typeof priceInfo>) =>
    p.mismatch ? <div className="text-[10px] text-warning mt-1">Approved custom plan is for another tier; not applied</div> : null;

  const tierSelect = (r: any, tier: string) => (
    <Select value={tier} onValueChange={(v) => requestTierChange(r.id, v, tier)} disabled={!canManage}>
      <SelectTrigger className="h-8 w-28" aria-label={`Change tier for ${r.full_name || "doctor"}`}><SelectValue /></SelectTrigger>
      <SelectContent>
        {/* "free" is the trial tier, not something to move a doctor to; shown (disabled) only when current. */}
        {tier === "free" && <SelectItem value="free" disabled>free (trial)</SelectItem>}
        {tiers.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  const priceControls = (r: any, tier: string, hasCustom: boolean) => (
    <div className="flex gap-1.5">
      <AmountInput
        className="h-8 w-24"
        placeholder={hasCustom ? String(r.custom_plan_price) : `${livePrices[tier] ?? 0}`}
        value={prices[r.id] ?? ""}
        onChange={(e) => setPrices((x) => ({ ...x, [r.id]: e.target.value }))}
      />
      <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => saveCustomPrice(r.id)} disabled={!canManage} title="Save custom price">
        <Save className="h-3.5 w-3.5" />
      </Button>
      <Button size="icon" variant="outline" className="h-8 w-8" disabled={!hasCustom || !canManage} onClick={() => clearCustomPrice(r.id)} title="Reset to default price">
        <RotateCcw className="h-3.5 w-3.5" />
      </Button>
    </div>
  );

  const extendControls = (r: any) => (
    <div className="flex gap-2">
      <Input type="date" className="h-8 w-36" disabled={!canManage} value={dates[r.id] || ""} onChange={(e) => setDates((x) => ({ ...x, [r.id]: e.target.value }))} />
      <Button size="sm" onClick={() => extend(r.id)} disabled={!dates[r.id] || !canManage}>Set</Button>
    </div>
  );

  const scheduledBadge = (id: string) =>
    pendingPlansMap[id] ? (
      <div className="mt-1">
        <Badge variant="outline" className="bg-royal/5 border-royal/30 text-[10px] text-royal font-medium">
          Scheduled: {pendingPlansMap[id].target_tier} ({formatIstDate(pendingPlansMap[id].activation_date)})
        </Badge>
      </div>
    ) : null;

  return (
    <div className="space-y-4">
      {/* Plan overview — each card is also a filter */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {VIEW_CARDS.map((card) => {
          const active = view === card.view;
          return (
            <button
              key={card.view}
              type="button"
              onClick={() => chooseView(active && card.view !== "all" ? "all" : card.view)}
              aria-pressed={active}
              aria-label={loading ? card.label : `${card.label}: ${counts[card.view]}`}
              className={`text-left rounded-lg border bg-card p-4 transition-colors hover:bg-secondary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "border-primary ring-1 ring-primary" : ""}`}
            >
              <div className="text-xs uppercase text-muted-foreground">{card.label}</div>
              <div className={`text-2xl font-bold ${card.tone}`}>{loading ? <Skeleton className="h-7 w-10 mt-1" /> : counts[card.view]}</div>
              <div className="text-xs text-muted-foreground mt-1">{card.hint({ pro: livePrices.pro ?? 0, premium: livePrices.premium ?? 0 })}</div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8 h-9"
            placeholder="Search doctor, clinic or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="h-9 sm:w-52" aria-label="Sort"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="joined">Newest joined first</SelectItem>
            <SelectItem value="expiry">Expiry: soonest first</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 sm:ml-auto">
          <span className="text-xs text-muted-foreground">
            {selectedRows.length > 0
              ? `${selectedRows.length} of ${filtered.length} selected`
              : `${view !== "all" ? `${VIEW_LABEL[view]}: ` : ""}${filtered.length} of ${rows.length}`}
          </span>
          {filtersActive && <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={resetFilters}>Reset filters</Button>}
        </div>
      </div>

      {/* Table — tablet/desktop */}
      <Card className="hidden md:block">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-xs uppercase text-muted-foreground">
              <tr>
                <th className="pl-4 pr-2 py-3 w-10">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={toggleAll}
                    disabled={loading || filtered.length === 0}
                    aria-label="Select all doctors"
                    className="h-5 w-5 rounded"
                  />
                </th>
                <th className="text-left p-3">Doctor</th>
                <th className="text-left p-3">Tier</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Effective Price</th>
                <th className="text-left p-3">Change Tier</th>
                <th className="text-left p-3">Custom Price (₹)</th>
                <th className="text-left p-3">Expiry / Trial End</th>
                <th className="text-left p-3">Extend Date</th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 6 }).map((_, i) => (
                <tr key={`sk-${i}`} className="border-t" aria-hidden="true">
                  <td className="pl-4 pr-2 py-4"><Skeleton className="h-5 w-5 rounded" /></td>
                  <td className="p-3"><Skeleton className="h-4 w-36" /><Skeleton className="h-3 w-24 mt-2" /></td>
                  <td className="p-3"><Skeleton className="h-5 w-14 rounded-full" /></td>
                  <td className="p-3"><Skeleton className="h-5 w-16 rounded-full" /></td>
                  <td className="p-3"><Skeleton className="h-4 w-14" /></td>
                  <td className="p-3"><Skeleton className="h-8 w-28" /></td>
                  <td className="p-3"><Skeleton className="h-8 w-40" /></td>
                  <td className="p-3"><Skeleton className="h-4 w-20" /></td>
                  <td className="p-3"><Skeleton className="h-8 w-44" /></td>
                </tr>
              ))}
              {!loading && filtered.map(({ row: r, c }) => {
                const tier = r.plan_tier || "free";
                const p = priceInfo(r, tier);
                const selected = selectedIds.has(r.id);
                return (
                  <tr key={r.id} className={`border-t align-top ${selected ? "bg-primary/5" : ""}`}>
                    <td className="pl-4 pr-2 py-3 w-10">
                      <Checkbox checked={selected} onCheckedChange={() => toggleSelected(r.id)} aria-label={`Select ${r.full_name || "doctor"}`} className="h-5 w-5 rounded" />
                    </td>
                    <td className="p-3">
                      <div className="font-medium">{r.full_name}</div>
                      <div className="text-xs text-muted-foreground">{r.clinic_name}</div>
                    </td>
                    <td className="p-3">
                      <Badge className="bg-royal/10 text-royal hover:bg-royal/10 border-royal/20 capitalize">{tier}</Badge>
                      {scheduledBadge(r.id)}
                    </td>
                    <td className="p-3">
                      <StatusBadge c={c} />
                      {c.expiringSoon && <div className="text-[10px] text-warning font-medium mt-1">Expiring soon</div>}
                    </td>
                    <td className="p-3">
                      <div className="font-semibold">₹{p.effective}</div>
                      {priceBadge(p)}
                      {mismatchNote(p)}
                    </td>
                    <td className="p-3">{tierSelect(r, tier)}</td>
                    <td className="p-3">{priceControls(r, tier, p.hasCustom)}</td>
                    <td className="p-3">{expiryCell(c)}</td>
                    <td className="p-3">{extendControls(r)}</td>
                  </tr>
                );
              })}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className="p-6 text-center text-muted-foreground text-sm">{emptyMessage}</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Cards — mobile */}
      <div className="md:hidden space-y-2">
        {!loading && filtered.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <Checkbox
              checked={allSelected ? true : someSelected ? "indeterminate" : false}
              onCheckedChange={toggleAll}
              aria-label="Select all doctors"
              className="h-5 w-5 rounded"
            />
            Select all
          </label>
        )}
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={`sk-${i}`} aria-hidden="true">
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-8 w-full" />
              </CardContent>
            </Card>
          ))
        ) : filtered.length === 0 ? (
          <Card><CardContent className="p-6 text-center text-muted-foreground text-sm">{emptyMessage}</CardContent></Card>
        ) : (
          filtered.map(({ row: r, c }) => {
            const tier = r.plan_tier || "free";
            const p = priceInfo(r, tier);
            const selected = selectedIds.has(r.id);
            return (
              <Card key={r.id} className={selected ? "bg-primary/5 border-primary/30" : ""}>
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="pt-1">
                    <Checkbox checked={selected} onCheckedChange={() => toggleSelected(r.id)} aria-label={`Select ${r.full_name || "doctor"}`} className="h-5 w-5 rounded" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium">{r.full_name}</div>
                        <div className="text-xs text-muted-foreground">{r.clinic_name}</div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        <StatusBadge c={c} />
                        <Badge className="bg-royal/10 text-royal hover:bg-royal/10 border-royal/20 capitalize">{tier}</Badge>
                      </div>
                    </div>
                    {scheduledBadge(r.id)}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-[10px] uppercase text-muted-foreground">Effective price</div>
                        <div className="font-semibold">₹{p.effective}</div>
                        {priceBadge(p)}
                        {mismatchNote(p)}
                      </div>
                      <div>
                        <div className="text-[10px] uppercase text-muted-foreground">Expiry / trial end</div>
                        {expiryCell(c)}
                        {c.expiringSoon && <div className="text-[10px] text-warning font-medium mt-1">Expiring soon</div>}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="text-[10px] uppercase text-muted-foreground">Change tier</div>
                      {tierSelect(r, tier)}
                      <div className="text-[10px] uppercase text-muted-foreground">Custom price (₹)</div>
                      {priceControls(r, tier, p.hasCustom)}
                      <div className="text-[10px] uppercase text-muted-foreground">Extend date</div>
                      {extendControls(r)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold text-sm mb-1">Self-Service Upgrade Payments</h3>
          <p className="text-xs text-muted-foreground mb-3">Latest 50 upgrades paid by doctors themselves.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="p-2 font-medium">Doctor</th>
                  <th className="p-2 font-medium">Upgrade</th>
                  <th className="p-2 font-medium">Amount</th>
                  <th className="p-2 font-medium">Status</th>
                  <th className="p-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {upgradePayments.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="p-2">
                      <div className="font-medium">{p.profiles?.full_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{p.profiles?.clinic_name || ""}</div>
                    </td>
                    <td className="p-2 text-xs whitespace-nowrap">
                      {p.kind === "seats" ? paymentKindLabel(p.kind, p.seats_quantity) : `${p.from_tier} → ${p.target_tier}${p.seats_quantity ? ` · ${paymentKindLabel(p.kind, p.seats_quantity)}` : ""}`}
                    </td>
                    <td className="p-2">₹{p.amount}</td>
                    <td className="p-2 whitespace-nowrap">
                      <Badge variant={p.status === "captured" ? "default" : p.status === "failed" ? "destructive" : "secondary"}>
                        {p.status}
                      </Badge>
                      {p.needs_refund && <Badge variant="destructive" className="ml-1 text-[10px]" title={p.needs_refund_reason ?? undefined}>Needs refund</Badge>}
                      {p.is_mock && <Badge variant="outline" className="ml-1 text-[10px]">mock</Badge>}
                    </td>
                    <td className="p-2 text-xs whitespace-nowrap">{formatIstDate(p.created_at)}</td>
                  </tr>
                ))}
                {upgradePayments.length === 0 && (
                  <tr><td colSpan={5} className="p-6 text-center text-muted-foreground text-sm">No self-service upgrade payments yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!pendingTierChange} onOpenChange={(o) => !o && setPendingTierChange(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change plan tier to "{pendingTierChange?.tier}"?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              {pendingTierChange?.wasTrial && (
                <p>
                  This doctor is currently on a trial. Changing their plan tier will end the trial
                  immediately and apply "{pendingTierChange.tier}" plan features right away.
                </p>
              )}
              {pendingTierChange?.hasCustom && (
                <p>
                  This doctor has a custom price of ₹{pendingTierChange.customPrice}. Choose whether to
                  keep that custom price on the new "{pendingTierChange.tier}" plan, or reset to the default price.
                </p>
              )}
              {!pendingTierChange?.wasTrial && !pendingTierChange?.hasCustom && (
                <p>This applies immediately.</p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {pendingTierChange?.hasCustom ? (
              <>
                <Button variant="outline" onClick={() => applyTierChange(false)}>Reset to default price</Button>
                <Button onClick={() => applyTierChange(true)}>Keep custom price</Button>
              </>
            ) : (
              <AlertDialogAction onClick={() => applyTierChange(false)}>Confirm</AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Floating bulk action bar */}
      {selectedRows.length > 0 && (
        <div
          role="toolbar"
          aria-label="Bulk actions"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] sm:w-auto max-w-md"
        >
          <div className="bg-background/90 backdrop-blur-md border shadow-lg rounded-full px-4 sm:px-6 py-3 flex items-center justify-center gap-3 sm:gap-4">
            <span className="text-sm font-medium text-foreground whitespace-nowrap">
              {selectedRows.length} doctor{selectedRows.length === 1 ? "" : "s"} selected
            </span>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearSelection}>
              Clear
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-full px-4"
              onClick={() => setBulkDeleteOpen(true)}
              disabled={!canDeleteDoctors}
              title={canDeleteDoctors ? undefined : "You don't have permission to delete doctors"}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete Selected
            </Button>
          </div>
        </div>
      )}

      {bulkDeleteOpen && (
        <BulkDeleteDoctorsDialog
          targets={bulkTargets}
          onClose={() => setBulkDeleteOpen(false)}
          onDeleted={() => { clearSelection(); load(); loadUpgradePayments(); }}
        />
      )}
    </div>
  );
};

export default SASubscriptions;
