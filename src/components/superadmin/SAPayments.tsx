// Super Admin UI (doctylia-razorpay-design.md §4 "Super Admin UI" + §2 flow):
// Dashboard (collection + commission), All Payments, Doctor-wise Earnings,
// Monthly Payout screen (run the rollup + approve/trigger RazorpayX transfer),
// Payout History. Reads go through the "Admins can view all X" RLS policies;
// the two mutating actions call the calculate-monthly-earnings and
// create-doctor-payout edge functions (admin-JWT checked server-side too).
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import {
  Wallet, IndianRupee, PieChart, History, Loader2, Info,
  RefreshCw, Send, Users2, CreditCard,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Payment = Tables<"payments">;
type Ledger = Tables<"doctor_ledger">;
type Payout = Tables<"payouts">;
type ProfileLite = { id: string; full_name: string | null; clinic_name: string | null };

const paymentStatusStyle: Record<string, { bg: string; text: string }> = {
  created: { bg: "bg-muted", text: "text-muted-foreground" },
  authorized: { bg: "bg-royal/10", text: "text-royal" },
  captured: { bg: "bg-success/10", text: "text-success" },
  failed: { bg: "bg-destructive/10", text: "text-destructive" },
  refunded: { bg: "bg-warning/10", text: "text-warning" },
};
const payoutStatusStyle: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: "bg-warning/10", text: "text-warning", label: "Pending" },
  processing: { bg: "bg-royal/10", text: "text-royal", label: "Processing" },
  processed: { bg: "bg-success/10", text: "text-success", label: "Paid" },
  failed: { bg: "bg-destructive/10", text: "text-destructive", label: "Failed" },
  cancelled: { bg: "bg-muted", text: "text-muted-foreground", label: "Cancelled" },
};

const SAPayments = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [loading, setLoading] = useState(true);
  const [runningCalc, setRunningCalc] = useState(false);
  const [payingOut, setPayingOut] = useState<string | null>(null);

  const loadData = async () => {
    const [paymentsRes, ledgerRes, payoutsRes, profilesRes] = await Promise.all([
      supabase.from("payments").select("*").order("created_at", { ascending: false }).limit(300),
      supabase.from("doctor_ledger").select("*"),
      supabase.from("payouts").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, clinic_name"),
    ]);
    setPayments(paymentsRes.data || []);
    setLedger(ledgerRes.data || []);
    setPayouts(payoutsRes.data || []);
    const map: Record<string, ProfileLite> = {};
    (profilesRes.data || []).forEach((p) => { map[p.id] = p; });
    setProfiles(map);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const doctorLabel = (id: string) => profiles[id]?.clinic_name || profiles[id]?.full_name || id.slice(0, 8);

  const captured = payments.filter((p) => p.status === "captured");
  const totalCollected = captured.reduce((s, p) => s + Number(p.amount), 0);
  const totalCommission = ledger.reduce((s, l) => s + Number(l.commission_amount), 0);
  const totalDoctorShare = ledger.reduce((s, l) => s + Number(l.doctor_share), 0);
  const pendingPayoutTotal = payouts.filter((p) => p.status === "pending" || p.status === "processing")
    .reduce((s, p) => s + Number(p.total_amount), 0);

  const overviewCards = [
    { label: "Total Collected", value: totalCollected, icon: IndianRupee, gradient: "from-royal to-teal" },
    { label: "Platform Commission", value: totalCommission, icon: PieChart, gradient: "from-teal to-success" },
    { label: "Doctor Share (Gross)", value: totalDoctorShare, icon: Users2, gradient: "from-success to-royal" },
    { label: "Awaiting Payout", value: pendingPayoutTotal, icon: Wallet, gradient: "from-warning to-royal" },
  ];

  const monthlyChart = (() => {
    const byMonth = new Map<string, number>();
    captured.forEach((p) => {
      const key = (p.created_at || "").slice(0, 7);
      byMonth.set(key, (byMonth.get(key) || 0) + Number(p.amount));
    });
    return Array.from(byMonth.entries()).sort().map(([month, total]) => ({ month, total }));
  })();

  const doctorEarnings = (() => {
    const byDoctor = new Map<string, { gross: number; commission: number; doctorShare: number; unpaid: number }>();
    ledger.forEach((l) => {
      const row = byDoctor.get(l.doctor_id) || { gross: 0, commission: 0, doctorShare: 0, unpaid: 0 };
      row.gross += Number(l.gross_amount);
      row.commission += Number(l.commission_amount);
      row.doctorShare += Number(l.doctor_share);
      if (!l.paid) row.unpaid += Number(l.doctor_share);
      byDoctor.set(l.doctor_id, row);
    });
    return Array.from(byDoctor.entries()).sort((a, b) => b[1].gross - a[1].gross);
  })();

  const pendingPayouts = payouts.filter((p) => p.status === "pending" || p.status === "processing");
  const payoutHistory = payouts.filter((p) => p.status === "processed" || p.status === "failed" || p.status === "cancelled");

  const runMonthlyCalculation = async () => {
    setRunningCalc(true);
    const { data, error } = await supabase.functions.invoke("calculate-monthly-earnings", { body: {} });
    setRunningCalc(false);
    if (error) {
      toast.error("Couldn't run the monthly rollup. Please try again.");
      return;
    }
    toast.success(`Rollup complete for ${data?.month}`, { description: `${data?.doctors ?? 0} doctor payout(s) queued.` });
    loadData();
  };

  const approvePayout = async (payoutId: string) => {
    setPayingOut(payoutId);
    const { data, error } = await supabase.functions.invoke("create-doctor-payout", { body: { payout_id: payoutId } });
    setPayingOut(null);
    if (error || !data?.ok) {
      toast.error("Payout couldn't be sent", {
        description: "RazorpayX likely isn't configured yet, or the doctor hasn't finished bank/UPI setup.",
      });
      return;
    }
    toast.success("Payout sent to RazorpayX", { description: "It will show as Paid once RazorpayX confirms processing." });
    loadData();
  };

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-royal" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="font-heading font-bold text-2xl text-primary flex items-center gap-2">
          <Wallet className="h-6 w-6 text-royal" /> Payments & Payouts
        </h1>
        <Button size="sm" variant="outline" onClick={runMonthlyCalculation} disabled={runningCalc} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${runningCalc ? "animate-spin" : ""}`} />
          {runningCalc ? "Running..." : "Run Monthly Payout Calculation"}
        </Button>
      </div>

      <Card className="border-royal/30 bg-royal/5">
        <CardContent className="p-4 flex items-start gap-3">
          <Info className="h-5 w-5 text-royal flex-shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            Patients pay into Doctylia's Razorpay account here. Run the monthly rollup to turn last month's
            captured payments into per-doctor payouts, then approve each one to send it via RazorpayX.
          </p>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="space-y-5">
        <TabsList className="bg-card border border-border h-11 flex-wrap h-auto">
          <TabsTrigger value="overview" className="gap-1.5"><PieChart className="h-3.5 w-3.5" /> Overview</TabsTrigger>
          <TabsTrigger value="payments" className="gap-1.5"><CreditCard className="h-3.5 w-3.5" /> All Payments</TabsTrigger>
          <TabsTrigger value="doctors" className="gap-1.5"><Users2 className="h-3.5 w-3.5" /> Doctor-wise Earnings</TabsTrigger>
          <TabsTrigger value="payouts" className="gap-1.5"><Send className="h-3.5 w-3.5" /> Payouts{pendingPayouts.length > 0 && ` (${pendingPayouts.length})`}</TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5"><History className="h-3.5 w-3.5" /> Payout History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {overviewCards.map((c) => (
              <Card key={c.label} className="border-0 shadow-none overflow-hidden">
                <CardContent className={`p-5 bg-gradient-to-br ${c.gradient} text-white relative`}>
                  <div className="absolute top-3 right-3 opacity-20"><c.icon className="h-10 w-10" /></div>
                  <div className="relative z-10">
                    <div className="text-xs font-medium text-white/80">{c.label}</div>
                    <div className="font-heading font-extrabold text-xl mt-1">₹{c.value.toLocaleString("en-IN")}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader><CardTitle className="text-base">Collections — monthly</CardTitle></CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer>
                  <BarChart data={monthlyChart}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="month" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip formatter={(v: number) => `₹${v.toLocaleString("en-IN")}`} />
                    <Bar dataKey="total" fill="hsl(var(--royal))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="space-y-2">
          {payments.length === 0 ? (
            <EmptyState icon={CreditCard} text="No payments yet" />
          ) : (
            payments.map((p) => {
              const style = paymentStatusStyle[p.status] || paymentStatusStyle.created;
              // Money was captured by Razorpay but no appointment could be created
              // (slot race, or the patient closed the tab before verification) —
              // surface this so it doesn't silently disappear.
              const orphaned = p.status === "captured" && (p.needs_refund || !p.appointment_id);
              return (
                <Card key={p.id} className={`border-border/60 shadow-none hover:shadow-sm transition-shadow ${orphaned ? "border-destructive/40" : ""}`}>
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{doctorLabel(p.doctor_id)}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {p.razorpay_order_id || "—"} · {format(new Date(p.created_at), "d MMM yyyy, h:mm a")}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {orphaned && (
                        <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive">Needs Refund Review</Badge>
                      )}
                      <Badge variant="outline" className={`text-[10px] capitalize ${style.bg} ${style.text}`}>{p.status}</Badge>
                      <span className="font-heading font-bold text-foreground">₹{Number(p.amount).toLocaleString("en-IN")}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="doctors" className="space-y-2">
          {doctorEarnings.length === 0 ? (
            <EmptyState icon={Users2} text="No doctor earnings yet" />
          ) : (
            doctorEarnings.map(([doctorId, e]) => (
              <Card key={doctorId} className="border-border/60 shadow-none">
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-sm font-medium text-foreground">{doctorLabel(doctorId)}</div>
                  <div className="flex items-center gap-4 text-xs flex-wrap">
                    <span className="text-muted-foreground">Gross <strong className="text-foreground">₹{e.gross.toLocaleString("en-IN")}</strong></span>
                    <span className="text-muted-foreground">Commission <strong className="text-foreground">₹{e.commission.toLocaleString("en-IN")}</strong></span>
                    <span className="text-muted-foreground">Doctor Share <strong className="text-foreground">₹{e.doctorShare.toLocaleString("en-IN")}</strong></span>
                    <Badge variant="outline" className={`text-[10px] ${e.unpaid > 0 ? "bg-warning/10 text-warning" : "bg-success/10 text-success"}`}>
                      {e.unpaid > 0 ? `₹${e.unpaid.toLocaleString("en-IN")} unpaid` : "Fully paid out"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="payouts" className="space-y-2">
          {pendingPayouts.length === 0 ? (
            <EmptyState icon={Send} text="No pending payouts" sub="Run the monthly calculation above to queue this month's payouts." />
          ) : (
            pendingPayouts.map((p) => {
              const style = payoutStatusStyle[p.status];
              return (
                <Card key={p.id} className="border-border/60 shadow-none">
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-foreground">{doctorLabel(p.doctor_id)}</div>
                      <div className="text-xs text-muted-foreground">{p.month}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className={`text-[10px] ${style.bg} ${style.text}`}>{style.label}</Badge>
                      <span className="font-heading font-bold text-foreground">₹{Number(p.total_amount).toLocaleString("en-IN")}</span>
                      <Button size="sm" className="bg-royal hover:bg-royal/90 h-8 text-xs" disabled={p.status !== "pending" || payingOut === p.id}
                        onClick={() => approvePayout(p.id)}>
                        {payingOut === p.id ? "Sending..." : "Approve & Pay"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-2">
          {payoutHistory.length === 0 ? (
            <EmptyState icon={History} text="No payout history yet" />
          ) : (
            payoutHistory.map((p) => {
              const style = payoutStatusStyle[p.status];
              return (
                <Card key={p.id} className="border-border/60 shadow-none">
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-foreground">{doctorLabel(p.doctor_id)}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.month}{p.failure_reason ? ` · ${p.failure_reason}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className={`text-[10px] ${style.bg} ${style.text}`}>{style.label}</Badge>
                      <span className="font-heading font-bold text-foreground">₹{Number(p.total_amount).toLocaleString("en-IN")}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

const EmptyState = ({ icon: Icon, text, sub }: { icon: typeof Wallet; text: string; sub?: string }) => (
  <Card className="border-border/60 shadow-none">
    <CardContent className="py-16 text-center">
      <Icon className="h-12 w-12 text-royal/20 mx-auto mb-3" />
      <p className="text-muted-foreground font-medium">{text}</p>
      {sub && <p className="text-xs text-muted-foreground/60 mt-1">{sub}</p>}
    </CardContent>
  </Card>
);

export default SAPayments;
