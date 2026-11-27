import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, IndianRupee } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatInr, istMonthRange, revenueErrorMessage, type MyRevenueResult, type RevenueRow } from "@/lib/practitioners/revenue";

const inr = formatInr;
const IST_YM = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" });
const MONTH_LABEL = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", month: "long", year: "numeric" });

const currentYm = () => {
  const [y, m] = IST_YM.format(new Date()).split("-").map(Number);
  return { y, m: m - 1 };
};

// A doctor login's own totals (aggregates only), shown on the dashboard when the clinic owner has
// switched "Let each doctor see their own earnings" on. If it is off the card does not render at all.
const MyEarningsCard = () => {
  const now = useMemo(currentYm, []);
  const [ym, setYm] = useState(now);
  const [state, setState] = useState<{ loading: boolean; hidden: boolean; error: string | null; row: RevenueRow | null; shown: boolean }>({ loading: true, hidden: false, error: null, row: null, shown: false });
  const [retryKey, setRetryKey] = useState(0);

  const range = useMemo(() => istMonthRange(new Date(Date.UTC(ym.y, ym.m, 15))), [ym]);
  const isCurrent = ym.y === now.y && ym.m === now.m;

  useEffect(() => {
    let cancelled = false;
    // Clear the old month straight away so last month's figures never sit under the new month's label.
    setState((s) => ({ ...s, loading: true, error: null, row: null }));
    (async () => {
      try {
        const { data, error } = await supabase.rpc("get_my_practitioner_revenue", { _from: range.from, _to: range.to });
        if (cancelled) return;
        const res = data as unknown as MyRevenueResult | null;
        if (error || !res) setState({ loading: false, hidden: false, error: revenueErrorMessage(null), row: null, shown: true });
        else if (!res.ok) {
          const code = (res as { error?: string }).error;
          if (code === "NOT_ENABLED") setState({ loading: false, hidden: true, error: null, row: null, shown: false });
          else setState({ loading: false, hidden: false, error: revenueErrorMessage(code), row: null, shown: true });
        } else setState({ loading: false, hidden: false, error: null, row: res.row ?? null, shown: true });
      } catch {
        if (!cancelled) setState({ loading: false, hidden: false, error: revenueErrorMessage(null), row: null, shown: true });
      }
    })();
    return () => { cancelled = true; };
  }, [range.from, range.to, retryKey]);

  if (state.hidden) return null;
  // First load: render nothing rather than flash a card that may turn out to be switched off.
  if (state.loading && !state.shown) return null;

  const step = (delta: number) => setYm((c) => {
    const d = new Date(Date.UTC(c.y, c.m + delta, 1));
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
  });
  const r = state.row;

  return (
    <Card className="rounded-2xl" data-testid="my-earnings" aria-busy={state.loading}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <IndianRupee className="h-4 w-4 text-teal" aria-hidden="true" /> My earnings
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label="Previous month" onClick={() => step(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[8rem] text-center">{MONTH_LABEL.format(new Date(Date.UTC(ym.y, ym.m, 1)))}</span>
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label="Next month" disabled={isCurrent} onClick={() => step(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {state.error && (
          <div className="flex items-center justify-between gap-2">
            <p role="alert" className="text-xs text-muted-foreground">{state.error}</p>
            <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => setRetryKey((k) => k + 1)}>Try again</Button>
          </div>
        )}
        {!state.loading && !state.error && !r && <p className="text-sm text-muted-foreground">No activity this month</p>}
        {r && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div><p className="text-xs text-muted-foreground">Visits completed</p><p className="text-xl font-heading font-bold tabular-nums">{r.visits_completed}</p></div>
              <div><p className="text-xs text-muted-foreground">Revenue (before GST)</p><p className="text-xl font-heading font-bold tabular-nums">{inr(r.paid_amount)}</p></div>
            </div>
            <div className="space-y-1.5 text-sm">
              {([["Cash", r.by_mode.cash], ["UPI", r.by_mode.upi], ["Card", r.by_mode.card], ["Online", r.by_mode.online]] as const).map(([k, v]) => (
                <div key={k} className="flex justify-between"><span className="text-muted-foreground">{k}</span><span className="tabular-nums">{inr(v)}</span></div>
              ))}
              <div className="flex justify-between border-t border-border pt-1.5">
                <span className="text-muted-foreground">Refunds ({r.refunds_count})</span><span className="tabular-nums">{inr(r.refunds_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paid no-shows ({r.paid_no_shows_count})</span><span className="tabular-nums">{inr(r.paid_no_shows_amount)}</span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default MyEarningsCard;
