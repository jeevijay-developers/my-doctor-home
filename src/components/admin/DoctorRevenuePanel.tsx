import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatInr, hasActivity, payoutCsv, revenueErrorMessage,
  type RevenueNumbers, type RevenueResult, type RevenueRow,
} from "@/lib/practitioners/revenue";

const inr = formatInr;

interface Line extends RevenueNumbers { key: string; name: string; inactive?: boolean; kind?: "total" | "unattributed" }

type Ok = Extract<RevenueResult, { ok: true }>;

// Multi-doctor clinics only (Billing mounts it when isMulti && billing.view). Figures come from the
// database report for the period, never from the page's own invoice arrays.
const DoctorRevenuePanel = ({ from, to, periodLabel }: { from: string; to: string; periodLabel: string }) => {
  const [state, setState] = useState<{ loading: boolean; error: string | null; data: Ok | null }>({ loading: true, error: null, data: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, data: null });
    (async () => {
      try {
        const { data, error } = await supabase.rpc("get_practitioner_revenue", { _from: from, _to: to });
        if (cancelled) return;
        const res = data as unknown as RevenueResult | null;
        if (error || !res) setState({ loading: false, error: revenueErrorMessage(null), data: null });
        else if (!res.ok) setState({ loading: false, error: revenueErrorMessage((res as { error?: string }).error), data: null });
        else setState({ loading: false, error: null, data: res });
      } catch {
        if (!cancelled) setState({ loading: false, error: revenueErrorMessage(null), data: null });
      }
    })();
    return () => { cancelled = true; };
  }, [from, to]);

  const lines: Line[] = useMemo(() => {
    const d = state.data;
    if (!d) return [];
    const out: Line[] = d.rows.map((r: RevenueRow) => ({ ...r, key: r.practitioner_id, name: r.display_name, inactive: !r.is_active }));
    if (hasActivity(d.unattributed)) out.push({ ...d.unattributed, key: "unattributed", name: "Unattributed", kind: "unattributed" });
    out.push({ ...d.totals, key: "total", name: "Total", kind: "total" });
    return out;
  }, [state.data]);

  const download = () => {
    const d = state.data;
    if (!d) return;
    const rows: Array<RevenueNumbers & { display_name: string }> = d.rows.map((r) => ({ ...r }));
    if (hasActivity(d.unattributed)) rows.push({ ...d.unattributed, display_name: "Unattributed" });
    const blob = new Blob([payoutCsv(rows)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `doctylia-payout-${d.from}_to_${d.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Payout sheet downloaded");
  };

  const heads = ["Doctor", "Visits", "Revenue (ex-GST)", "GST", "Cash", "UPI", "Card", "Online", "Refunds", "Platform charge", "Net", "Net after refunds", "Paid no-shows"];

  return (
    <Card className="border-border/60 shadow-none" data-testid="doctor-revenue">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Stethoscope className="h-4 w-4 text-royal" aria-hidden="true" /> By doctor
            <span className="text-xs font-normal text-muted-foreground">{periodLabel}</span>
          </CardTitle>
          <Button size="sm" variant="outline" className="h-9" onClick={download} disabled={!state.data}>
            <Download className="h-3.5 w-3.5 mr-1" /> Download payout CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {state.loading && (
          <p className="text-sm text-muted-foreground flex items-center gap-2" role="status"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
        )}
        {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
        {state.data && (
          <>
            <Card className="hidden md:block border-border/60 shadow-none overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    {heads.map((h, i) => (
                      <th key={h} scope="col" className={`p-2 font-medium ${i > 0 ? "text-right" : ""}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.key} className={`border-b border-border/50 last:border-0 ${l.kind === "total" ? "font-semibold bg-muted/40" : ""}`}>
                      <td className="p-2">{l.name}{l.inactive && <Badge variant="secondary" className="ml-2 text-[10px]">Inactive</Badge>}</td>
                      <td className="p-2 text-right tabular-nums">{l.visits_completed}</td>
                      <td className="p-2 text-right tabular-nums">{inr(l.paid_amount)}</td>
                      <td className="p-2 text-right tabular-nums">{inr(l.gst_amount)}</td>
                      <td className="p-2 text-right tabular-nums">{inr(l.by_mode.cash)}</td>
                      <td className="p-2 text-right tabular-nums">{inr(l.by_mode.upi)}</td>
                      <td className="p-2 text-right tabular-nums">{inr(l.by_mode.card)}</td>
                      <td className="p-2 text-right tabular-nums">{inr(l.by_mode.online)}</td>
                      <td className="p-2 text-right tabular-nums">{inr(l.refunds_amount)} <span className="text-[11px] text-muted-foreground">({l.refunds_count})</span></td>
                      <td className="p-2 text-right tabular-nums">{inr(l.platform_charge)}</td>
                      <td className="p-2 text-right tabular-nums">{inr(l.net)}</td>
                      <td className="p-2 text-right tabular-nums">{inr(l.net_after_refunds)}</td>
                      <td className="p-2 text-right tabular-nums">{inr(l.paid_no_shows_amount)} <span className="text-[11px] text-muted-foreground">({l.paid_no_shows_count})</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <div className="md:hidden space-y-2">
              {lines.map((l) => (
                <Card key={l.key} className={`border-border/60 shadow-none ${l.kind === "total" ? "bg-muted/40" : ""}`}>
                  <CardContent className="p-3 space-y-1.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{l.name}{l.inactive && <Badge variant="secondary" className="ml-2 text-[10px]">Inactive</Badge>}</span>
                      <span className="text-xs text-muted-foreground">{l.visits_completed} visits</span>
                    </div>
                    {([
                      ["Revenue (ex-GST)", inr(l.paid_amount)], ["GST", inr(l.gst_amount)],
                      ["Cash / UPI", `${inr(l.by_mode.cash)} / ${inr(l.by_mode.upi)}`], ["Card / Online", `${inr(l.by_mode.card)} / ${inr(l.by_mode.online)}`],
                      ["Refunds", `${inr(l.refunds_amount)} (${l.refunds_count})`], ["Platform charge", inr(l.platform_charge)],
                      ["Net", inr(l.net)], ["Net after refunds", inr(l.net_after_refunds)], ["Paid no-shows", `${inr(l.paid_no_shows_amount)} (${l.paid_no_shows_count})`],
                    ] as const).map(([k, v]) => (
                      <div key={k} className="flex justify-between"><span className="text-muted-foreground">{k}</span><span className="tabular-nums">{v}</span></div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">Revenue is as invoiced; refunds are shown in the month they were made. Revenue is before GST.</p>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default DoctorRevenuePanel;
