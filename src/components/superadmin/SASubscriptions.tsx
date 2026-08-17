import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { logAdminAction } from "@/lib/adminAudit";
import { Search, RotateCcw, Save, Trash2, X } from "lucide-react";
import BulkDeleteDoctorsDialog from "./BulkDeleteDoctorsDialog";

// Default plan prices (INR / month). Single source of truth for default pricing.
export const DEFAULT_PLAN_PRICES: Record<string, number> = {
  free: 0,
  pro: 1499,
  premium: 3999,
};

export const getEffectivePlanPrice = (profile: { plan_tier?: string | null; custom_plan_price?: number | null }) => {
  if (profile.custom_plan_price != null) return Number(profile.custom_plan_price);
  return DEFAULT_PLAN_PRICES[profile.plan_tier || "free"] ?? 0;
};

const SASubscriptions = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [dates, setDates] = useState<Record<string, string>>({});
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [pendingTierChange, setPendingTierChange] = useState<{
    id: string; tier: string; prev: string; wasTrial: boolean; hasCustom: boolean; customPrice: number | null;
  } | null>(null);

  const [upgradePayments, setUpgradePayments] = useState<any[]>([]);
  const [pendingPlansMap, setPendingPlansMap] = useState<Record<string, any>>({});

  // Bulk selection/delete mirrors the Doctor Side → Patients pattern
  // (PatientsPage.tsx) exactly.
  const [selectMode, setSelectMode] = useState(false);
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
  const exitSelectMode = () => { setSelectMode(false); clearSelection(); };

  const load = () =>
    supabase.from("profiles").select("*").order("created_at", { ascending: false }).then(({ data }) => setRows(data ?? []));

  const loadUpgradePayments = () =>
    supabase
      .from("plan_upgrade_payments")
      .select("id, doctor_id, from_tier, target_tier, amount, status, is_mock, created_at, profiles(full_name, clinic_name)")
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

  useEffect(() => { load(); loadUpgradePayments(); loadPendingPlans(); }, []);

  const tiers = ["free", "pro", "premium"];
  const tierCounts = Object.fromEntries(tiers.map((t) => [t, rows.filter((r) => (r.plan_tier || "free") === t).length]));
  const customCount = rows.filter((r) => r.custom_plan_price != null).length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      (r.full_name || "").toLowerCase().includes(q) ||
      (r.clinic_name || "").toLowerCase().includes(q) ||
      (r.email || "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  const bulkTargets = rows.filter((r) => selectedIds.has(r.id)).map((r) => ({ id: r.id, full_name: r.full_name }));

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
    if (!pendingTierChange) return;
    const { id, tier, prev, wasTrial, hasCustom } = pendingTierChange;

    const update: any = { plan_tier: tier, plan_status: "active", trial_end: null };
    if (hasCustom && !keepCustomPrice) update.custom_plan_price = null;

    const { error } = await supabase.from("profiles").update(update).eq("id", id);
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
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
    if (!d) return;
    const { error } = await supabase.from("profiles").update({ trial_end: d, plan_status: "trial" }).eq("id", id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    await logAdminAction("extend_trial", "profiles", id, { new_trial_end: d });
    toast({ title: "Trial extended" });
    setDates((x) => ({ ...x, [id]: "" }));
    load();
  };

  const saveCustomPrice = async (id: string) => {
    const raw = prices[id];
    if (raw === undefined || raw === "") {
      toast({ title: "Enter a price", description: "Type an amount or click Reset to remove the override.", variant: "destructive" });
      return;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      toast({ title: "Invalid price", description: "Price must be zero or a positive number.", variant: "destructive" });
      return;
    }
    const prev = rows.find((r) => r.id === id)?.custom_plan_price ?? null;
    const { error } = await supabase.from("profiles").update({ custom_plan_price: value }).eq("id", id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    await logAdminAction("set_custom_price", "profiles", id, { from: prev, to: value });
    toast({ title: "Custom price saved", description: `Doctor will now be billed ₹${value}.` });
    setPrices((x) => ({ ...x, [id]: "" }));
    load();
  };

  const resetCustomPrice = async (id: string) => {
    const prev = rows.find((r) => r.id === id)?.custom_plan_price ?? null;
    if (prev == null) return;
    const { error } = await supabase.from("profiles").update({ custom_plan_price: null }).eq("id", id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    await logAdminAction("reset_custom_price", "profiles", id, { from: prev });
    toast({ title: "Custom price removed", description: "Doctor reverted to standard plan price." });
    setPrices((x) => ({ ...x, [id]: "" }));
    load();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {tiers.map((t) => (
          <Card key={t}>
            <CardContent className="p-4">
              <div className="text-xs uppercase text-muted-foreground">{t}</div>
              <div className="text-2xl font-bold text-primary">{tierCounts[t]}</div>
              <div className="text-xs text-muted-foreground mt-1">Default ₹{DEFAULT_PLAN_PRICES[t]}</div>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase text-muted-foreground">Custom Pricing</div>
            <div className="text-2xl font-bold text-royal">{customCount}</div>
            <div className="text-xs text-muted-foreground mt-1">doctors on override</div>
          </CardContent>
        </Card>
      </div>

      <div className={`flex items-center gap-2 transition-opacity ${selectMode ? "opacity-60 pointer-events-none" : ""}`}>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8 h-9"
            placeholder="Search doctor, clinic or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="text-xs text-muted-foreground">{filtered.length} of {rows.length}</div>
      </div>

      {/* Select mode toggle */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {selectMode && <span>{selectedIds.size} of {filtered.length} selected</span>}
          </div>
          <div className="flex items-center gap-2">
            {selectMode && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => {
                  if (selectedIds.size === filtered.length) clearSelection();
                  else setSelectedIds(new Set(filtered.map((r) => r.id)));
                }}
              >
                {selectedIds.size === filtered.length ? "Deselect all" : `Select all ${filtered.length}`}
              </Button>
            )}
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant={selectMode ? "default" : "outline"}
                    className={`h-8 w-8 p-0 ${selectMode ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}`}
                    onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                    aria-pressed={selectMode}
                    aria-label={selectMode ? "Exit selection mode" : "Select items to delete"}
                  >
                    {selectMode ? <X className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{selectMode ? "Done" : "Select to delete"}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-xs uppercase text-muted-foreground">
              <tr>
                {selectMode && <th className="p-3 w-10"></th>}
                <th className="text-left p-3">Doctor</th>
                <th className="text-left p-3">Tier</th>
                <th className="text-left p-3">Effective Price</th>
                <th className="text-left p-3">Change Tier</th>
                <th className="text-left p-3">Custom Price (₹)</th>
                <th className="text-left p-3">Trial end</th>
                <th className="text-left p-3">Extend</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const tier = r.plan_tier || "free";
                const hasCustom = r.custom_plan_price != null;
                const effective = getEffectivePlanPrice(r);
                return (
                  <tr key={r.id} className={`border-t align-top ${selectedIds.has(r.id) ? "bg-destructive/5" : ""}`}>
                    {selectMode && (
                      <td className="p-3">
                        <Checkbox checked={selectedIds.has(r.id)} onCheckedChange={() => toggleSelected(r.id)} aria-label={`Select ${r.full_name || "doctor"}`} />
                      </td>
                    )}
                    <td className="p-3">
                      <div className="font-medium">{r.full_name}</div>
                      <div className="text-xs text-muted-foreground">{r.clinic_name}</div>
                    </td>
                    <td className="p-3">
                      <Badge className="bg-royal/10 text-royal hover:bg-royal/10 border-royal/20 capitalize">{tier}</Badge>
                      {pendingPlansMap[r.id] && (
                        <div className="mt-1">
                          <Badge variant="outline" className="bg-royal/5 border-royal/30 text-[10px] text-royal font-medium">
                            Scheduled: {pendingPlansMap[r.id].target_tier} ({new Date(pendingPlansMap[r.id].activation_date).toLocaleDateString()})
                          </Badge>
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="font-semibold">₹{effective}</div>
                      {hasCustom ? (
                        <Badge className="mt-1 bg-spark/15 text-spark hover:bg-spark/15 border-spark/30 text-[10px]">Custom Pricing</Badge>
                      ) : (
                        <div className="text-[10px] text-muted-foreground mt-1">Default</div>
                      )}
                    </td>
                    <td className="p-3">
                      <Select value={tier} onValueChange={(v) => requestTierChange(r.id, v, tier)}>
                        <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>{tiers.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1.5">
                        <Input
                          type="number"
                          min={0}
                          step="1"
                          className="h-8 w-24"
                          placeholder={hasCustom ? String(r.custom_plan_price) : `${DEFAULT_PLAN_PRICES[tier]}`}
                          value={prices[r.id] ?? ""}
                          onChange={(e) => setPrices((x) => ({ ...x, [r.id]: e.target.value }))}
                        />
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8"
                          onClick={() => saveCustomPrice(r.id)}
                          title="Save custom price"
                        >
                          <Save className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8"
                          disabled={!hasCustom}
                          onClick={() => resetCustomPrice(r.id)}
                          title="Reset to default price"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                    <td className="p-3 text-xs">{r.trial_end ? new Date(r.trial_end).toLocaleDateString() : "—"}</td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <Input type="date" className="h-8 w-36" value={dates[r.id] || ""} onChange={(e) => setDates((x) => ({ ...x, [r.id]: e.target.value }))} />
                        <Button size="sm" onClick={() => extend(r.id)} disabled={!dates[r.id]}>Set</Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={selectMode ? 8 : 7} className="p-6 text-center text-muted-foreground text-sm">No doctors match your search.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold text-sm mb-3">Self-Service Upgrade Payments</h3>
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
                  <td className="p-2 text-xs">{p.from_tier} → {p.target_tier}</td>
                  <td className="p-2">₹{p.amount}</td>
                  <td className="p-2">
                    <Badge variant={p.status === "captured" ? "default" : p.status === "failed" ? "destructive" : "secondary"}>
                      {p.status}
                    </Badge>
                    {p.is_mock && <Badge variant="outline" className="ml-1 text-[10px]">mock</Badge>}
                  </td>
                  <td className="p-2 text-xs">{new Date(p.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {upgradePayments.length === 0 && (
                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground text-sm">No self-service upgrade payments yet.</td></tr>
              )}
            </tbody>
          </table>
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
      {selectMode && selectedIds.size > 0 && (
        <div
          role="toolbar"
          aria-label="Bulk actions"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] sm:w-auto max-w-md"
        >
          <div className="bg-background/90 backdrop-blur-md border shadow-lg rounded-full px-4 sm:px-6 py-3 flex items-center gap-3 sm:gap-4">
            <span className="text-sm font-medium text-foreground whitespace-nowrap">
              {selectedIds.size} doctor{selectedIds.size === 1 ? "" : "s"} selected
            </span>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearSelection}>
              Clear
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-full px-4"
              onClick={() => setBulkDeleteOpen(true)}
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
          onDeleted={() => { exitSelectMode(); load(); loadUpgradePayments(); }}
        />
      )}
    </div>
  );
};

export default SASubscriptions;
