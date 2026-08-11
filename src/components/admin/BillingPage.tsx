import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import {
  CreditCard, TrendingUp, Calendar, IndianRupee, PieChart, Download,
  FileText, Eye, Loader2,
} from "lucide-react";
import StatCard from "@/components/shared/StatCard";
import PaymentStatusDonut, { type DonutSegment } from "@/components/shared/PaymentStatusDonut";
import { format, startOfWeek, startOfMonth, endOfWeek, endOfMonth } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { generateInvoicePDF, type InvoicePayload } from "@/lib/invoicePdf";
import { usePlanAccess } from "@/hooks/usePlanAccess";
import LockedFeatureCard from "./LockedFeatureCard";

type Invoice = {
  id: string;
  invoice_number: string;
  patient_name: string;
  service_name: string;
  amount: number;
  gst_rate: number;
  gst_amount: number;
  total_amount: number;
  clinic_gstin: string | null;
  status: string;
  created_at: string;
  appointment_id: string;
};

const BillingPage = () => {
  const { profile } = useProfile();
  const { isPremium, loading: planLoading } = usePlanAccess();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [filter, setFilter] = useState("all");
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [generatingInvoices, setGeneratingInvoices] = useState(false);

  const loadData = async () => {
    if (!profile) return;
    const [aRes, iRes] = await Promise.all([
      supabase.from("appointments").select("*").eq("doctor_id", profile.id).order("date", { ascending: false }),
      (supabase.from("invoices" as any) as any).select("*").eq("doctor_id", profile.id).order("created_at", { ascending: false }),
    ]);
    setAppointments(aRes.data || []);
    setInvoices((iRes.data || []) as Invoice[]);
  };

  useEffect(() => {
    if (profile && isPremium) {
      loadData();
    }
  }, [profile, isPremium]);

  // Realtime: refresh when appointments or invoices change for this doctor
  useEffect(() => {
    if (!profile || !isPremium) return;
    const channel = supabase.channel(`billing-${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `doctor_id=eq.${profile.id}` }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices", filter: `doctor_id=eq.${profile.id}` }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, isPremium]);

  // Auto-generate invoices for any paid appointment that doesn't yet have one.
  useEffect(() => {
    const run = async () => {
      if (!profile || !isPremium || appointments.length === 0) return;
      const paidAppts = appointments.filter(a => a.payment_status === "paid");
      const missing = paidAppts.filter(a => !invoices.some(i => i.appointment_id === a.id));
      if (missing.length === 0) return;

      setGeneratingInvoices(true);
      const gstRegistered = Boolean((profile as any).gst_registered);
      const gstin = (profile as any).gstin || null;
      const year = new Date().getFullYear();

      // Find max existing sequence for this year to continue numbering.
      const prefix = `INV-${year}-`;
      const existingNums = invoices
        .map(i => i.invoice_number)
        .filter(n => n.startsWith(prefix))
        .map(n => parseInt(n.slice(prefix.length), 10))
        .filter(n => !isNaN(n));
      let seq = existingNums.length ? Math.max(...existingNums) : 0;

      for (const appt of missing) {
        seq += 1;
        const invoice_number = `${prefix}${String(seq).padStart(4, "0")}`;
        const amount = Number(appt.amount) || 0;
        const gst_rate = gstRegistered ? 18 : 0;
        const gst_amount = +(amount * gst_rate / 100).toFixed(2);
        const total_amount = +(amount + gst_amount).toFixed(2);
        await (supabase.from("invoices" as any) as any).insert({
          doctor_id: profile.id,
          appointment_id: appt.id,
          invoice_number,
          patient_name: appt.patient_name,
          service_name: appt.service_name,
          amount,
          gst_rate,
          gst_amount,
          total_amount,
          clinic_gstin: gstin,
          status: "generated",
        });
      }
      setGeneratingInvoices(false);
      // Reload invoices only
      const { data } = await (supabase.from("invoices" as any) as any)
        .select("*").eq("doctor_id", profile.id).order("created_at", { ascending: false });
      setInvoices((data || []) as Invoice[]);
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointments.length, profile?.id]);

  const today = format(new Date(), "yyyy-MM-dd");
  const weekStart = format(startOfWeek(new Date()), "yyyy-MM-dd");
  const weekEnd = format(endOfWeek(new Date()), "yyyy-MM-dd");
  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd");

  // Revenue totals are computed from the persisted invoices table (not from
  // live appointments), so deleting an appointment or patient later does NOT
  // retroactively reduce Revenue / Billing figures.
  const invoiceDate = (inv: Invoice) => (inv.created_at || "").slice(0, 10);
  const todayRev = invoices.filter((i) => invoiceDate(i) === today).reduce((s, i) => s + Number(i.amount || 0), 0);
  const weekRev = invoices.filter((i) => invoiceDate(i) >= weekStart && invoiceDate(i) <= weekEnd).reduce((s, i) => s + Number(i.amount || 0), 0);
  const monthRev = invoices.filter((i) => invoiceDate(i) >= monthStart && invoiceDate(i) <= monthEnd).reduce((s, i) => s + Number(i.amount || 0), 0);

  // Persisted transaction rows are built from the invoices table (which
  // survives appointment/patient deletion via ON DELETE SET NULL). We then
  // append appointments that haven't been invoiced yet (pending / pay-at-
  // clinic / refunded) so the doctor still sees open items.
  type TxRow = {
    key: string;
    patient_name: string;
    service_name: string;
    date: string;
    amount: number;
    payment_status: "paid" | "pending" | "refunded" | "pay_at_clinic";
    status: string;
  };
  const invoicedApptIds = new Set(invoices.map(i => i.appointment_id).filter(Boolean));
  const invoiceTx: TxRow[] = invoices.map(i => ({
    key: `inv-${i.id}`,
    patient_name: i.patient_name,
    service_name: i.service_name,
    date: invoiceDate(i),
    amount: Number(i.amount || 0),
    payment_status: "paid",
    status: "completed",
  }));
  const openApptTx: TxRow[] = appointments
    .filter(a => !invoicedApptIds.has(a.id) && a.payment_status !== "paid")
    .map(a => ({
      key: `apt-${a.id}`,
      patient_name: a.patient_name,
      service_name: a.service_name,
      date: a.date,
      amount: Number(a.amount || 0),
      payment_status: a.payment_status,
      status: a.status,
    }));
  const transactions: TxRow[] = [...invoiceTx, ...openApptTx].sort(
    (a, b) => (b.date || "").localeCompare(a.date || "")
  );

  const filtered = filter === "all" ? transactions : transactions.filter(t => t.payment_status === filter);

  const paidCount = transactions.filter(t => t.payment_status === "paid").length;
  const pendingCount = transactions.filter(t => t.payment_status === "pending").length;
  const clinicCount = transactions.filter(t => t.payment_status === "pay_at_clinic").length;
  const refundedCount = transactions.filter(t => t.payment_status === "refunded").length;
  const totalCount = transactions.length || 1;

  const paymentColors: Record<string, { bg: string; text: string; label: string }> = {
    paid: { bg: "bg-success/10", text: "text-success", label: "Paid" },
    pending: { bg: "bg-warning/10", text: "text-warning", label: "Pending" },
    refunded: { bg: "bg-destructive/10", text: "text-destructive", label: "Refunded" },
    pay_at_clinic: { bg: "bg-royal/10", text: "text-royal", label: "Pay at Clinic" },
  };

  const statusColors: Record<string, string> = {
    completed: "bg-success/10 text-success",
    cancelled: "bg-destructive/10 text-destructive",
    confirmed: "bg-royal/10 text-royal",
    pending: "bg-warning/10 text-warning",
  };

  const revenueCards = [
    { label: "Today's Revenue", value: todayRev, icon: Calendar, gradient: "from-royal to-teal" },
    { label: "This Week", value: weekRev, icon: TrendingUp, gradient: "from-teal to-success" },
    { label: "This Month", value: monthRev, icon: IndianRupee, gradient: "from-success to-royal" },
  ];

  const exportTransactionsCSV = () => {
    const rows = filtered.map(a => ({
      "Patient Name": a.patient_name,
      "Service": a.service_name,
      "Date": a.date,
      "Amount (INR)": a.amount,
      "Payment Status": a.payment_status,
      "Appointment Status": a.status,
    }));
    if (rows.length === 0) { toast.error("No transactions to export"); return; }
    const headers = Object.keys(rows[0]);
    const escape = (v: any) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers.join(","), ...rows.map(r => headers.map(h => escape((r as any)[h])).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeName = (profile?.full_name || "doctor").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    a.download = `doctylia-transactions-${safeName}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Transactions exported");
  };

  const buildInvoicePayload = (inv: Invoice): InvoicePayload => ({
    invoice_number: inv.invoice_number,
    created_at: inv.created_at,
    patient_name: inv.patient_name,
    service_name: inv.service_name,
    amount: Number(inv.amount),
    gst_rate: Number(inv.gst_rate),
    gst_amount: Number(inv.gst_amount),
    total_amount: Number(inv.total_amount),
    clinic_gstin: inv.clinic_gstin,
    doctor_name: profile?.full_name || "Doctor",
    clinic_name: profile?.clinic_name,
    clinic_address: profile?.address,
    clinic_phone: profile?.phone,
    gst_registered: Boolean((profile as any)?.gst_registered),
  });

  const downloadInvoice = (inv: Invoice) => {
    generateInvoicePDF(buildInvoicePayload(inv));
  };

  if (planLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-7 w-7 animate-spin text-royal" />
      </div>
    );
  }

  if (!isPremium) {
    return (
      <div className="max-w-6xl mx-auto">
        <LockedFeatureCard
          featureName="Billing & Invoices"
          description="Track revenue, auto-generate GST invoices, and export transactions. Available on Premium."
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h1 className="font-heading font-bold text-2xl text-primary flex items-center gap-2">
        <CreditCard className="h-6 w-6 text-success" /> Billing & Revenue
      </h1>

      <div className="grid sm:grid-cols-3 gap-4">
        {revenueCards.map((r) => (
          <StatCard key={r.label} label={r.label} value={`₹${r.value.toLocaleString("en-IN")}`} icon={r.icon} gradient={r.gradient} />
        ))}
      </div>

      <Tabs defaultValue="transactions" className="space-y-5">
        <TabsList className="bg-card border border-border h-11">
          <TabsTrigger value="transactions" className="gap-1.5"><CreditCard className="h-3.5 w-3.5" /> Transactions</TabsTrigger>
          <TabsTrigger value="invoices" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" /> Invoices
            {generatingInvoices && <Loader2 className="h-3 w-3 animate-spin ml-1" />}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="transactions" className="space-y-4">
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="font-heading font-semibold text-lg text-foreground">Transactions</h2>
                <div className="flex items-center gap-2">
                  <Select value={filter} onValueChange={setFilter}>
                    <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Payment Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Payments</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="refunded">Refunded</SelectItem>
                      <SelectItem value="pay_at_clinic">Pay at Clinic</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" onClick={exportTransactionsCSV} className="h-9">
                    <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
                  </Button>
                </div>
              </div>

              {filtered.length === 0 ? (
                <Card className="border-border/60 shadow-none">
                  <CardContent className="py-16 text-center">
                    <CreditCard className="h-12 w-12 text-success/20 mx-auto mb-3" />
                    <p className="text-muted-foreground font-medium">No transactions yet</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {filtered.map((a) => {
                    const pc = paymentColors[a.payment_status] || paymentColors.pending;
                    return (
                      <Card key={a.key} className="border-border/60 shadow-none hover:shadow-sm transition-shadow">
                        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center text-sm font-bold text-success flex-shrink-0">
                              {a.patient_name?.charAt(0)?.toUpperCase() || "P"}
                            </div>
                            <div>
                              <div className="font-medium text-foreground text-sm">{a.patient_name}</div>
                              <div className="text-xs text-muted-foreground">{a.service_name} · {a.date}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 sm:gap-3 flex-wrap flex-shrink-0">
                            <Badge variant="outline" className={`text-[10px] ${pc.bg} ${pc.text}`}>{pc.label}</Badge>
                            <Badge variant="outline" className={`text-[10px] capitalize ${statusColors[a.status] || ""}`}>{a.status}</Badge>
                            <span className="font-heading font-bold text-foreground">₹{a.amount}</span>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>

            <Card className="border-border/60 shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <PieChart className="h-4 w-4 text-royal" /> Payment Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PaymentStatusDonut
                  total={totalCount}
                  buckets={
                    [
                      { label: "Paid", count: paidCount, color: "hsl(var(--success))" },
                      { label: "Pending", count: pendingCount, color: "hsl(var(--warning))" },
                      { label: "Pay at Clinic", count: clinicCount, color: "hsl(var(--royal))" },
                      { label: "Refunded", count: refundedCount, color: "hsl(var(--destructive))" },
                    ] satisfies DonutSegment[]
                  }
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="invoices" className="space-y-3">
          {invoices.length === 0 ? (
            <Card className="border-border/60 shadow-none">
              <CardContent className="py-16 text-center">
                <FileText className="h-12 w-12 text-royal/20 mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">No invoices yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Invoices auto-generate when an appointment's payment is marked as Paid.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {invoices.map((inv) => (
                <Card key={inv.id} className="border-border/60 shadow-none hover:shadow-sm transition-shadow">
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-royal/10 flex items-center justify-center text-royal flex-shrink-0">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-foreground text-sm truncate">{inv.invoice_number}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {inv.patient_name} · {inv.service_name} · {format(new Date(inv.created_at), "d MMM yyyy")}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px] capitalize bg-success/10 text-success">{inv.status}</Badge>
                      <span className="font-heading font-bold text-foreground">₹{Number(inv.total_amount).toLocaleString("en-IN")}</span>
                      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setViewingInvoice(inv)}>
                        <Eye className="h-3.5 w-3.5 mr-1" /> View
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => downloadInvoice(inv)}>
                        <Download className="h-3.5 w-3.5 mr-1" /> PDF
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!viewingInvoice} onOpenChange={(o) => !o && setViewingInvoice(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-royal" /> Invoice Preview
            </DialogTitle>
          </DialogHeader>
          {viewingInvoice && (
            <div className="space-y-4 text-sm">
              <div className="flex items-start justify-between border-b border-border pb-3">
                <div>
                  <div className="font-heading font-bold text-lg text-primary">Dr. {profile?.full_name}</div>
                  {profile?.clinic_name && <div className="text-muted-foreground">{profile.clinic_name}</div>}
                  {profile?.address && <div className="text-xs text-muted-foreground max-w-[240px]">{profile.address}</div>}
                  {profile?.phone && <div className="text-xs text-muted-foreground">Phone: {profile.phone}</div>}
                  {(profile as any)?.gst_registered && (profile as any)?.gstin && (
                    <div className="text-xs text-muted-foreground">GSTIN: {(profile as any).gstin}</div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Invoice #</div>
                  <div className="font-mono font-semibold text-foreground">{viewingInvoice.invoice_number}</div>
                  <div className="text-xs text-muted-foreground mt-2">Date</div>
                  <div className="text-foreground">{format(new Date(viewingInvoice.created_at), "d MMM yyyy")}</div>
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Bill To</div>
                <div className="font-medium text-foreground">{viewingInvoice.patient_name}</div>
              </div>
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="flex justify-between bg-royal text-white px-3 py-2 text-xs font-semibold">
                  <span>Description</span><span>Amount</span>
                </div>
                <div className="flex justify-between px-3 py-2 border-b border-border">
                  <span>{viewingInvoice.service_name}</span>
                  <span>₹{Number(viewingInvoice.amount).toFixed(2)}</span>
                </div>
                {(profile as any)?.gst_registered && Number(viewingInvoice.gst_rate) > 0 ? (
                  <div className="flex justify-between px-3 py-2 border-b border-border text-muted-foreground">
                    <span>GST @ {Number(viewingInvoice.gst_rate)}%</span>
                    <span>₹{Number(viewingInvoice.gst_amount).toFixed(2)}</span>
                  </div>
                ) : (
                  <div className="px-3 py-2 border-b border-border text-xs text-muted-foreground">GST Not Applicable</div>
                )}
                <div className="flex justify-between px-3 py-2 font-heading font-bold text-primary">
                  <span>Total</span>
                  <span>₹{Number(viewingInvoice.total_amount).toFixed(2)}</span>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setViewingInvoice(null)}>Close</Button>
                <Button className="bg-royal hover:bg-royal/90" onClick={() => downloadInvoice(viewingInvoice)}>
                  <Download className="h-4 w-4 mr-1" /> Download PDF
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BillingPage;
