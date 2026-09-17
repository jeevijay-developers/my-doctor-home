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
import {
  Wallet, IndianRupee, PieChart, History, Loader2, Info,
  RefreshCw, Send, Users2, CreditCard, ArrowRightLeft, CheckCircle2,
} from "lucide-react";
import DoctorGroupCard from "@/components/shared/DoctorGroupCard";
import { format } from "date-fns";
import { toast } from "sonner";
import { usePaymentMode } from "@/hooks/usePaymentMode";
import TestModeBadge from "@/components/shared/TestModeBadge";
import type { Tables } from "@/integrations/supabase/types";

type Payment = Tables<"payments">;
type Ledger = Tables<"doctor_ledger">;
type Payout = Tables<"payouts">;
type Transfer = Tables<"transfers">;
type ProfileLite = { id: string; full_name: string | null; clinic_name: string | null; razorpay_account_id?: string | null; razorpay_account_status?: string | null; razorpay_payment_enabled?: boolean | null };
type AppointmentLite = { id: string; doctor_id: string; patient_name: string | null; patient_phone: string | null; created_at: string };

const payoutStatusStyle: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: "bg-warning/10", text: "text-warning", label: "Pending" },
  processing: { bg: "bg-royal/10", text: "text-royal", label: "Processing" },
  processed: { bg: "bg-success/10", text: "text-success", label: "Paid" },
  failed: { bg: "bg-destructive/10", text: "text-destructive", label: "Failed" },
  cancelled: { bg: "bg-muted", text: "text-muted-foreground", label: "Cancelled" },
};

const transferStatusStyle: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: "bg-warning/10", text: "text-warning", label: "Pending (T+2)" },
  processed: { bg: "bg-success/10", text: "text-success", label: "Settled to Doctor" },
  failed: { bg: "bg-destructive/10", text: "text-destructive", label: "Failed" },
  reversed: { bg: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300", text: "text-purple-700 dark:text-purple-300", label: "Reversed (Refunded)" },
};

const SAPayments = () => {
  const { isMock: paymentModeIsMock } = usePaymentMode();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [appointments, setAppointments] = useState<AppointmentLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningCalc, setRunningCalc] = useState(false);
  const [payingOut, setPayingOut] = useState<string | null>(null);
  const [drillDoctorId, setDrillDoctorId] = useState<string | null>(null);
  const [drillPatientKey, setDrillPatientKey] = useState<string | null>(null);

  const loadData = async () => {
    const [paymentsRes, transfersRes, ledgerRes, payoutsRes, profilesRes, appointmentsRes] = await Promise.all([
      supabase.from("payments").select("*").order("created_at", { ascending: false }).limit(300),
      supabase.from("transfers").select("*").order("created_at", { ascending: false }).limit(300),
      supabase.from("doctor_ledger").select("*"),
      supabase.from("payouts").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, clinic_name, razorpay_account_id, razorpay_account_status, razorpay_payment_enabled"),
      supabase.from("appointments").select("id, doctor_id, patient_name, patient_phone, created_at"),
    ]);
    setPayments(paymentsRes.data || []);
    setTransfers(transfersRes.data || []);
    setLedger(ledgerRes.data || []);
    setPayouts(payoutsRes.data || []);
    const map: Record<string, ProfileLite> = {};
    (profilesRes.data || []).forEach((p) => { map[p.id] = p; });
    setProfiles(map);
    setAppointments((appointmentsRes.data || []) as AppointmentLite[]);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const doctorLabel = (id: string) => profiles[id]?.full_name || id.slice(0, 8);
  const appointmentById = new Map(appointments.map((a) => [a.id, a]));

  const totalRouted = transfers
    .filter((t) => t.status === "processed" || t.status === "pending")
    .reduce((s, t) => s + Number(t.amount), 0);

  const activeLinkedAccountsCount = Object.values(profiles).filter(
    (p) => p.razorpay_payment_enabled || p.razorpay_account_status === "active"
  ).length;

  // Overview metrics: Platform collection, Route direct transfers, and Legacy payouts
  const overviewCards = [
    { label: "Total Collected", value: totalCollected, icon: IndianRupee, gradient: "from-royal to-teal" },
    { label: "Direct Route Transfers", value: totalRouted, icon: ArrowRightLeft, gradient: "from-teal to-emerald-600" },
    { label: "Awaiting Payout (Legacy)", value: pendingPayoutTotal, icon: Wallet, gradient: "from-warning to-royal" },
  ];

  const paymentsByDoctor = (() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const p of payments) {
      const row = map.get(p.doctor_id) || { count: 0, total: 0 };
      row.count += 1;
      row.total += Number(p.amount);
      map.set(p.doctor_id, row);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total);
  })();

  const patientKeyFor = (p: Payment) => {
    const appt = p.appointment_id ? appointmentById.get(p.appointment_id) : undefined;
    return appt?.patient_phone || `unknown-${p.id}`;
  };

  const doctorEarnings = (() => {
    // No commission is taken, so gross === doctorShare always — kept as
    // separate fields (rather than collapsed to one) so this shape stays
    // stable if a commission is ever reintroduced later.
    const byDoctor = new Map<string, { gross: number; commission: number; doctorShare: number; unpaid: number; count: number }>();
    ledger.forEach((l) => {
      const row = byDoctor.get(l.doctor_id) || { gross: 0, commission: 0, doctorShare: 0, unpaid: 0, count: 0 };
      row.gross += Number(l.gross_amount);
      row.commission += Number(l.commission_amount);
      row.doctorShare += Number(l.doctor_share);
      if (!l.paid) row.unpaid += Number(l.doctor_share);
      row.count += 1;
      byDoctor.set(l.doctor_id, row);
    });
    return Array.from(byDoctor.entries()).sort((a, b) => b[1].gross - a[1].gross);
  })();

  const payoutStatusCounts = (Object.keys(payoutStatusStyle) as Array<keyof typeof payoutStatusStyle>)
    .map((status) => ({ status, count: payouts.filter((p) => p.status === status).length }))
    .filter((s) => s.count > 0);

  const topEarners = doctorEarnings.slice(0, 5);
  const topEarnersMax = topEarners[0]?.[1].gross ?? 0;

  const patientsForDrillDoctor = (() => {
    if (!drillDoctorId) return [];
    const map = new Map<string, { patientName: string; count: number; total: number; lastDate: string }>();
    for (const p of payments) {
      if (p.doctor_id !== drillDoctorId) continue;
      const appt = p.appointment_id ? appointmentById.get(p.appointment_id) : undefined;
      const key = patientKeyFor(p);
      const row = map.get(key) || { patientName: appt?.patient_name || "Unknown patient", count: 0, total: 0, lastDate: p.created_at };
      row.count += 1;
      row.total += Number(p.amount);
      if (p.created_at > row.lastDate) row.lastDate = p.created_at;
      map.set(key, row);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total);
  })();

  const transactionsForDrillPatient = (() => {
    if (!drillDoctorId || !drillPatientKey) return [];
    return payments
      .filter((p) => p.doctor_id === drillDoctorId && patientKeyFor(p) === drillPatientKey)
      .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  })();

  const drillPatientName = patientsForDrillDoctor.find(([key]) => key === drillPatientKey)?.[1].patientName;

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
        <h1 className="font-heading font-bold text-2xl text-primary flex items-center gap-2 flex-wrap">
          <Wallet className="h-6 w-6 text-royal" /> Payments & Payouts
          {paymentModeIsMock && <TestModeBadge />}
        </h1>
        <Button size="sm" variant="outline" onClick={runMonthlyCalculation} disabled={runningCalc} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${runningCalc ? "animate-spin" : ""}`} />
          {runningCalc ? "Running..." : "Run Monthly Payout Calculation"}
        </Button>
      </div>

      <Card className="border-royal/30 bg-royal/5">
        <CardContent className="p-4 flex items-start gap-3">
          <Info className="h-5 w-5 text-royal flex-shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground space-y-1">
            <p>
              <strong>Direct Route Transfers (Active):</strong> Patient payments are automatically transferred directly to the doctor's Linked Account with 0% platform commission and settled on T+2.
            </p>
            <p className="text-xs text-muted-foreground/80">
              Legacy monthly payouts via RazorpayX are preserved below for historical records.
            </p>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="space-y-5">
        <TabsList className="bg-card border border-border h-11 flex-wrap h-auto">
          <TabsTrigger value="overview" className="gap-1.5"><PieChart className="h-3.5 w-3.5" /> Overview</TabsTrigger>
          <TabsTrigger value="transfers" className="gap-1.5"><ArrowRightLeft className="h-3.5 w-3.5" /> Route Transfers{transfers.length > 0 && ` (${transfers.length})`}</TabsTrigger>
          <TabsTrigger value="accounts" className="gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Linked Accounts ({activeLinkedAccountsCount})</TabsTrigger>
          <TabsTrigger value="payments" className="gap-1.5"><CreditCard className="h-3.5 w-3.5" /> All Payments</TabsTrigger>
          <TabsTrigger value="doctors" className="gap-1.5"><Users2 className="h-3.5 w-3.5" /> Doctor-wise Earnings</TabsTrigger>
          <TabsTrigger value="payouts" className="gap-1.5"><Send className="h-3.5 w-3.5" /> Legacy Payouts{pendingPayouts.length > 0 && ` (${pendingPayouts.length})`}</TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5"><History className="h-3.5 w-3.5" /> Payout History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
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

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Payout Status</CardTitle></CardHeader>
              <CardContent>
                {payoutStatusCounts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No payouts calculated yet.</p>
                ) : (
                  <div className="space-y-2">
                    {payoutStatusCounts.map(({ status, count }) => {
                      const style = payoutStatusStyle[status];
                      return (
                        <div key={status} className="flex items-center justify-between text-sm">
                          <Badge variant="outline" className={`text-[10px] ${style.bg} ${style.text}`}>{style.label}</Badge>
                          <span className="font-medium text-foreground">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Top Earning Doctors</CardTitle></CardHeader>
              <CardContent>
                {topEarners.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No earnings yet.</p>
                ) : (
                  <div className="space-y-3">
                    {topEarners.map(([doctorId, e]) => (
                      <div key={doctorId}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-foreground font-medium truncate">{doctorLabel(doctorId)}</span>
                          <span className="text-muted-foreground">₹{e.gross.toLocaleString("en-IN")}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                          <div className="h-full bg-royal rounded-full" style={{ width: `${topEarnersMax ? (e.gross / topEarnersMax) * 100 : 0}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="transfers" className="space-y-3">
          {transfers.length === 0 ? (
            <EmptyState icon={ArrowRightLeft} text="No Route transfers yet" sub="Transfers will appear here automatically when patients book appointments with online payment." />
          ) : (
            transfers.map((t) => {
              const style = transferStatusStyle[t.status] || transferStatusStyle.pending;
              return (
                <Card key={t.id} className="border-border/60 shadow-none">
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">
                        {doctorLabel(t.doctor_id)}
                      </div>
                      <div className="text-xs text-muted-foreground truncate space-x-2">
                        <span>Transfer ID: {t.razorpay_transfer_id || "Pending"}</span>
                        <span>·</span>
                        <span>Account: {t.razorpay_account_id}</span>
                        <span>·</span>
                        <span>{format(new Date(t.created_at), "d MMM yyyy, h:mm a")}</span>
                      </div>
                      {t.error && (
                        <div className="text-xs text-destructive mt-1 font-medium">
                          Error: {t.error}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {t.is_mock && <TestModeBadge />}
                      <Badge variant="outline" className={`text-[10px] ${style.bg} ${style.text}`}>
                        {style.label}
                      </Badge>
                      <span className="font-heading font-bold text-foreground">
                        ₹{Number(t.amount).toLocaleString("en-IN")}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="accounts" className="space-y-3">
          {Object.values(profiles).length === 0 ? (
            <EmptyState icon={CheckCircle2} text="No doctors found" />
          ) : (
            Object.values(profiles).map((p) => {
              const isEnabled = p.razorpay_payment_enabled;
              const status = p.razorpay_account_status || "not_started";
              return (
                <Card key={p.id} className="border-border/60 shadow-none">
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">
                        {p.full_name || p.clinic_name || "Doctor (" + p.id.slice(0, 8) + ")"}
                      </div>
                      <div className="text-xs text-muted-foreground truncate space-x-2">
                        {p.clinic_name && <span>{p.clinic_name} · </span>}
                        <span>Account ID: {p.razorpay_account_id || "Not created"}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          isEnabled
                            ? "bg-success/10 text-success"
                            : status === "processing" || status === "submitted"
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                        }`}
                      >
                        {isEnabled ? "Active & Receiving Payments" : status === "not_started" ? "Not Set Up" : `Status: ${status}`}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="payments" className="space-y-3">
          <div className="flex items-center gap-1.5 text-sm flex-wrap">
            <button
              className={`hover:underline ${!drillDoctorId ? "font-semibold text-foreground" : "text-royal"}`}
              onClick={() => { setDrillDoctorId(null); setDrillPatientKey(null); }}
            >
              All Doctors
            </button>
            {drillDoctorId && (
              <>
                <span className="text-muted-foreground">›</span>
                <button
                  className={`hover:underline ${!drillPatientKey ? "font-semibold text-foreground" : "text-royal"}`}
                  onClick={() => setDrillPatientKey(null)}
                >
                  {doctorLabel(drillDoctorId)}
                </button>
              </>
            )}
            {drillPatientKey && (
              <>
                <span className="text-muted-foreground">›</span>
                <span className="font-semibold text-foreground">{drillPatientName}</span>
              </>
            )}
          </div>

          <div className="space-y-2">
            {!drillDoctorId ? (
              paymentsByDoctor.length === 0 ? (
                <EmptyState icon={CreditCard} text="No payments yet" />
              ) : (
                paymentsByDoctor.map(([doctorId, s]) => (
                  <Card key={doctorId} className="border-border/60 shadow-none hover:shadow-sm transition-shadow cursor-pointer" onClick={() => setDrillDoctorId(doctorId)}>
                    <CardContent className="p-4 flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-foreground">{doctorLabel(doctorId)}</span>
                      <span className="text-xs text-muted-foreground">{s.count} transaction{s.count === 1 ? "" : "s"} · ₹{s.total.toLocaleString("en-IN")}</span>
                    </CardContent>
                  </Card>
                ))
              )
            ) : !drillPatientKey ? (
              patientsForDrillDoctor.length === 0 ? (
                <EmptyState icon={CreditCard} text="No payments for this doctor" />
              ) : (
                patientsForDrillDoctor.map(([key, s]) => (
                  <Card key={key} className="border-border/60 shadow-none hover:shadow-sm transition-shadow cursor-pointer" onClick={() => setDrillPatientKey(key)}>
                    <CardContent className="p-4 flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-foreground">{s.patientName}</span>
                      <span className="text-xs text-muted-foreground">{s.count} transaction{s.count === 1 ? "" : "s"} · ₹{s.total.toLocaleString("en-IN")} · last {format(new Date(s.lastDate), "d MMM yyyy")}</span>
                    </CardContent>
                  </Card>
                ))
              )
            ) : (
              transactionsForDrillPatient.length === 0 ? (
                <EmptyState icon={CreditCard} text="No transactions" />
              ) : (
                transactionsForDrillPatient.map((p) => {
                  const orphaned = p.status === "captured" && (p.needs_refund || !p.appointment_id);
                  return (
                    <Card key={p.id} className={`border-border/60 shadow-none ${orphaned ? "border-destructive/40" : ""}`}>
                      <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-foreground truncate">{p.razorpay_order_id || "—"}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {format(new Date(p.created_at), "d MMM yyyy, h:mm a")}{p.method ? ` · ${p.method}` : ""}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          {p.is_mock && <TestModeBadge />}
                          {orphaned && (
                            <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive">Needs Refund Review</Badge>
                          )}
                          <span className="font-heading font-bold text-foreground">₹{Number(p.amount).toLocaleString("en-IN")}</span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )
            )}
          </div>
        </TabsContent>

        <TabsContent value="doctors" className="space-y-2">
          {doctorEarnings.length === 0 ? (
            <EmptyState icon={Users2} text="No doctor earnings yet" />
          ) : (
            doctorEarnings.map(([doctorId, e]) => (
              <DoctorGroupCard
                key={doctorId}
                doctorName={doctorLabel(doctorId)}
                clinicName={profiles[doctorId]?.clinic_name ?? null}
                count={e.count}
                itemLabel="transaction"
              >
                <div className="p-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Amount Earned</span>
                    <span className="font-medium text-foreground">₹{e.doctorShare.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <span className="text-muted-foreground">Unpaid</span>
                    <Badge variant="outline" className={`text-[10px] ${e.unpaid > 0 ? "bg-warning/10 text-warning" : "bg-success/10 text-success"}`}>
                      {e.unpaid > 0 ? `₹${e.unpaid.toLocaleString("en-IN")}` : "Fully paid out"}
                    </Badge>
                  </div>
                </div>
              </DoctorGroupCard>
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
                      {p.is_mock && <TestModeBadge />}
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
                      {p.is_mock && <TestModeBadge />}
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
