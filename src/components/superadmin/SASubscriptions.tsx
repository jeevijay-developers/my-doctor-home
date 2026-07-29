import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { logAdminAction } from "@/lib/adminAudit";
import { Search, RotateCcw, Save } from "lucide-react";

// Default plan prices (INR / month). Single source of truth for default pricing.
export const DEFAULT_PLAN_PRICES: Record<string, number> = {
  free: 0,
  pro: 999,
  premium: 2499,
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

  const load = () =>
    supabase.from("profiles").select("*").order("created_at", { ascending: false }).then(({ data }) => setRows(data ?? []));
  useEffect(() => { load(); }, []);

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

  const changeTier = async (id: string, tier: string, prev: string) => {
    const row = rows.find((r) => r.id === id);
    const hasCustom = row?.custom_plan_price != null;
    if (hasCustom) {
      const keep = window.confirm(
        `This doctor has a custom price of ₹${row.custom_plan_price}. Keep the custom price on the new "${tier}" plan?\n\nOK = Keep custom price\nCancel = Reset to "${tier}" default price`
      );
      const update: any = { plan_tier: tier };
      if (!keep) update.custom_plan_price = null;
      const { error } = await supabase.from("profiles").update(update).eq("id", id);
      if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
      await logAdminAction("change_plan_tier", "profiles", id, { from: prev, to: tier, kept_custom_price: keep });
    } else {
      const { error } = await supabase.from("profiles").update({ plan_tier: tier }).eq("id", id);
      if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
      await logAdminAction("change_plan_tier", "profiles", id, { from: prev, to: tier });
    }
    toast({ title: "Tier updated" });
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

      <div className="flex items-center gap-2">
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

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-xs uppercase text-muted-foreground">
              <tr>
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
                  <tr key={r.id} className="border-t align-top">
                    <td className="p-3">
                      <div className="font-medium">{r.full_name}</div>
                      <div className="text-xs text-muted-foreground">{r.clinic_name}</div>
                    </td>
                    <td className="p-3">
                      <Badge className="bg-royal/10 text-royal hover:bg-royal/10 border-royal/20 capitalize">{tier}</Badge>
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
                      <Select value={tier} onValueChange={(v) => changeTier(r.id, v, tier)}>
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
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground text-sm">No doctors match your search.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
};

export default SASubscriptions;
