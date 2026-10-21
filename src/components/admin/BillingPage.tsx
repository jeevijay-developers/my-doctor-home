import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import {
  CreditCard, TrendingUp, Calendar, IndianRupee, PieChart, Download,
  FileText, Eye, Loader2, ChevronLeft, ChevronRight, X, Percent, Wallet, ArrowDownRight,
} from "lucide-react";
import StatCard from "@/components/shared/StatCard";
import PaymentStatusDonut, { type DonutSegment } from "@/components/shared/PaymentStatusDonut";
import TestModeBadge from "@/components/shared/TestModeBadge";
import { format, startOfWeek, startOfMonth, endOfWeek, endOfMonth, addMonths, subMonths } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { generateInvoicePDF, type InvoicePayload } from "@/lib/invoicePdf";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { FEATURE_KEYS } from "@/lib/features";
import LockedFeatureCard from "./LockedFeatureCard";
import DateFilter from "@/components/shared/DateFilter";
import PaginationBar, { PAGE_SIZE } from "@/components/shared/PaginationBar";

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
  commission_percent?: number | null;
  commission_amount?: number | null;
  net_amount?: number | null;
  refunded_at?: string | null;
};

type LedgerRow = {
  id: string;
  payment_id?: string | null;
  appointment_id: string;
  gross_amount: number;
  commission_percent: number;
  commission_amount: number;
  doctor_share: number;
  paid?: boolean;
  refunded?: boolean;
  refunded_at?: string | null;
  created_at?: string;
};

type PaymentRow = {
  id: string;
  appointment_id: string;
  amount: number;
  status?: string;
  transfer_status?: string | null;
  commission_percent?: number | null;
  commission_amount?: number | null;
  doctor_share?: number | null;
  created_at?: string;
};

const BillingPage = () => {
  const { profile } = useProfile();
  // Effective access (plan default + any active Superadmin override), not
  // raw plan tier — see FEATURE_KEYS.BILLING_INVOICES.
  const { hasFeature, loading: planLoading } = useFeatureAccess();
  const isPremium = hasFeature(FEATURE_KEYS.BILLING_INVOICES);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [filter, setFilter] = useState("all");
  // Transactions list defaults to the current month; switching to Date
  // narrows it to a single day instead. Mirrors the period-filter UX in
  // AppointmentsPage (DateFilter + PaginationBar).
  const [periodMode, setPeriodMode] = useState<"month" | "date">("month");
  const [periodActive, setPeriodActive] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [generatingInvoices, setGeneratingInvoices] = useState(false);

  const loadData = async () => {
    if (!profile) return;
    const safeQuery = async (promise: Promise<any>) => {
      try {
        const res = await promise;
        return res?.data || [];
      } catch {
        return [];
      }
    };
    const [aData, iData, lData, pData] = await Promise.all([
      safeQuery(supabase.from("appointments").select("*").eq("doctor_id", profile.id).order("date", { ascending: false }) as any),
      safeQuery((supabase.from("invoices" as any) as any).select("*").eq("doctor_id", profile.id).order("created_at", { ascending: false })),
      safeQuery((supabase.from("doctor_ledger" as any) as any).select("*").eq("doctor_id", profile.id).order("created_at", { ascending: false })),
      safeQuery((supabase.from("payments" as any) as any).select("*").eq("doctor_id", profile.id).order("created_at", { ascending: false })),
    ]);
    setAppointments(aData);
    setInvoices(iData as Invoice[]);
    setLedger(lData as LedgerRow[]);
    setPayments(pData as PaymentRow[]);
  };

  useEffect(() => {
    if (profile && isPremium) {
      loadData();
    }
  }, [profile, isPremium]);

  // Realtime: refresh when appointments, invoices, ledger, or payments change for this doctor
  useEffect(() => {
    if (!profile || !isPremium) return;
    const channel = supabase.channel(`billing-${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `doctor_id=eq.${profile.id}` }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices", filter: `doctor_id=eq.${profile.id}` }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "doctor_ledger", filter: `doctor_id=eq.${profile.id}` }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "payments", filter: `doctor_id=eq.${profile.id}` }, () => loadData())
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
        const matchedLedger = ledger.find(l => l.appointment_id === appt.id);
        const matchedPayment = payments.find(p => p.appointment_id === appt.id);
        const commission_percent = Number(matchedLedger?.commission_percent ?? matchedPayment?.commission_percent ?? 0);
        const commission_amount = Number(
          matchedLedger?.commission_amount ??
          matchedPayment?.commission_amount ??
          (commission_percent > 0 ? +(Math.round(amount * commission_percent) / 100).toFixed(2) : 0)
        );
        const net_amount = Number(
          matchedLedger?.doctor_share ??
          matchedPayment?.doctor_share ??
          +(amount - commission_amount).toFixed(2)
        );
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
          commission_percent,
          commission_amount,
          net_amount,
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

  // Reset to page 1 whenever the filtered result set changes shape underneath the pager.
  useEffect(() => { setPage(1); }, [filter, periodMode, periodActive, selectedMonth, selectedDate]);

  const today = format(new Date(), "yyyy-MM-dd");
  const selectedMonthStart = format(startOfMonth(selectedMonth), "yyyy-MM-dd");
  const selectedMonthEnd = format(endOfMonth(selectedMonth), "yyyy-MM-dd");
  const selectedDateStr = format(selectedDate, "yyyy-MM-dd");
  const isCurrentMonthSelected = format(selectedMonth, "yyyy-MM") === format(new Date(), "yyyy-MM");
  const isTodaySelected = selectedDateStr === today;

  // The three revenue cards track whatever period is active in the
  // Transactions filter below: picking a Date pivots Day/Week/Month around
  // that date, picking a Month pivots the Month card to it, and clearing the
  // filter falls back to the real today/this-week/this-month.
  const dateModeActive = periodActive && periodMode === "date";
  const monthModeActive = periodActive && periodMode === "month";

  const weekRefDate = dateModeActive ? selectedDate : new Date();
  const weekStart = format(startOfWeek(weekRefDate), "yyyy-MM-dd");
  const weekEnd = format(endOfWeek(weekRefDate), "yyyy-MM-dd");

  const dayCardDate = dateModeActive ? selectedDateStr : today;
  const dayCardLabel = dateModeActive && !isTodaySelected ? format(selectedDate, "d MMM yyyy") : "Today's Revenue";
  const weekCardLabel = dateModeActive && !isTodaySelected ? `Week of ${format(startOfWeek(selectedDate), "d MMM")}` : "This Week";
  const monthCardStart = monthModeActive ? selectedMonthStart : dateModeActive ? format(startOfMonth(selectedDate), "yyyy-MM-dd") : format(startOfMonth(new Date()), "yyyy-MM-dd");
  const monthCardEnd = monthModeActive ? selectedMonthEnd : dateModeActive ? format(endOfMonth(selectedDate), "yyyy-MM-dd") : format(endOfMonth(new Date()), "yyyy-MM-dd");
  // Clearing the transactions filter ("Showing all transactions") drops the
  // Month card's period bound entirely — it becomes a true all-time total
  // rather than silently reverting to the real current month.
  const monthCardLabel = !periodActive
    ? "All Time"
    : monthModeActive && !isCurrentMonthSelected
    ? format(selectedMonth, "MMMM yyyy")
    : dateModeActive && !isTodaySelected
    ? format(selectedDate, "MMMM yyyy")
    : "This Month";

  // Lookup maps for resolving platform commission split & Route settlement status
  const apptById = new Map(appointments.map(a => [a.id, a]));
  const apptGatewayById = new Map(appointments.map(a => [a.id, a.payment_gateway]));
  const ledgerByApptId = new Map(ledger.filter(l => l.appointment_id).map(l => [l.appointment_id, l]));
  const paymentByApptId = new Map(payments.filter(p => p.appointment_id).map(p => [p.appointment_id, p]));

  const resolveSplit = (params: {
    grossAmount: number;
    appointmentId?: string | null;
    inv?: Invoice;
    paymentStatus?: string;
  }) => {
    const gross = Number(params.grossAmount || 0);
    const apptRow = params.appointmentId ? apptById.get(params.appointmentId) : undefined;
    const ledgerRow = params.appointmentId ? ledgerByApptId.get(params.appointmentId) : undefined;
    const paymentRow = params.appointmentId ? paymentByApptId.get(params.appointmentId) : undefined;
    const inv = params.inv;

    const isPayAtClinic = params.paymentStatus === "pay_at_clinic" || apptRow?.payment_status === "pay_at_clinic";
    const isRefunded =
      params.paymentStatus === "refunded" ||
      inv?.status === "refunded" ||
      Boolean(ledgerRow?.refunded) ||
      paymentRow?.status === "refunded" ||
      paymentRow?.transfer_status === "reversed" ||
      apptRow?.payment_status === "refunded";

    if (isPayAtClinic) {
      return {
        gross,
        commission_percent: 0,
        commission_amount: 0,
        net_amount: gross,
        isRefunded: false,
        settlement_status: "pay_at_clinic" as const,
        settlement_label: "Pay at Clinic (0% fee)",
      };
    }

    const invPct = inv?.commission_percent != null ? Number(inv.commission_percent) : null;
    const ledgerPct = ledgerRow?.commission_percent != null ? Number(ledgerRow.commission_percent) : null;
    const paymentPct = paymentRow?.commission_percent != null ? Number(paymentRow.commission_percent) : null;

    const commission_percent =
      (invPct != null && invPct > 0 ? invPct : null) ??
      (ledgerPct != null && ledgerPct > 0 ? ledgerPct : null) ??
      (paymentPct != null && paymentPct > 0 ? paymentPct : null) ??
      invPct ??
      ledgerPct ??
      paymentPct ??
      0;

    const invComm = inv?.commission_amount != null ? Number(inv.commission_amount) : null;
    const ledgerComm = ledgerRow?.commission_amount != null ? Number(ledgerRow.commission_amount) : null;
    const paymentComm = paymentRow?.commission_amount != null ? Number(paymentRow.commission_amount) : null;

    const commission_amount =
      (invComm != null && invComm > 0 ? invComm : null) ??
      (ledgerComm != null && ledgerComm > 0 ? ledgerComm : null) ??
      (paymentComm != null && paymentComm > 0 ? paymentComm : null) ??
      (commission_percent > 0 ? +(Math.round(gross * commission_percent) / 100).toFixed(2) : 0);

    const invNet = inv?.net_amount != null ? Number(inv.net_amount) : null;
    const ledgerNet = ledgerRow?.doctor_share != null ? Number(ledgerRow.doctor_share) : null;
    const paymentNet = paymentRow?.doctor_share != null ? Number(paymentRow.doctor_share) : null;

    const net_amount =
      commission_amount > 0
        ? (invNet != null && invNet < gross ? invNet : null) ??
          (ledgerNet != null && ledgerNet < gross ? ledgerNet : null) ??
          (paymentNet != null && paymentNet < gross ? paymentNet : null) ??
          +(gross - commission_amount).toFixed(2)
        : invNet ?? ledgerNet ?? paymentNet ?? gross;

    let settlement_status: "settled" | "pending_settlement" | "failed" | "refunded" | "pay_at_clinic" = "settled";
    let settlement_label = "Settled to Bank";
    if (isRefunded) {
      settlement_status = "refunded";
      settlement_label = "Refunded";
    } else if (paymentRow?.transfer_status === "failed") {
      settlement_status = "failed";
      settlement_label = "Transfer Failed";
    } else if (paymentRow?.transfer_status === "processed" || ledgerRow?.paid === true) {
      settlement_status = "settled";
      settlement_label = "Settled to Bank";
    } else if (paymentRow || ledgerRow) {
      settlement_status = "pending_settlement";
      settlement_label = "Pending (T+2)";
    }

    return {
      gross,
      commission_percent,
      commission_amount,
      net_amount,
      isRefunded,
      settlement_status,
      settlement_label,
    };
  };

  // Revenue totals are computed from the persisted invoices table (not from
  // live appointments), so deleting an appointment or patient later does NOT
  // retroactively reduce Revenue / Billing figures. Refunded invoices are
  // excluded so refunded bookings do not inflate positive revenue.
  const invoiceDate = (inv: Invoice) => (inv.created_at || "").slice(0, 10);
  const invoicedApptIds = new Set(invoices.map(i => i.appointment_id).filter(Boolean));

  type RevenueEntry = {
    date: string;
    gross: number;
    commission_amount: number;
    net_amount: number;
  };

  const activeInvoiceEntries: RevenueEntry[] = invoices
    .map(inv => {
      const split = resolveSplit({ grossAmount: Number(inv.amount || 0), appointmentId: inv.appointment_id, inv });
      return {
        date: invoiceDate(inv),
        gross: split.gross,
        commission_amount: split.commission_amount,
        net_amount: split.net_amount,
        isRefunded: split.isRefunded,
      };
    })
    .filter(entry => !entry.isRefunded);

  // Fallback for paid appointments that have not yet been persisted into invoices
  const uninvoicedPaidEntries: RevenueEntry[] = appointments
    .filter(a => !invoicedApptIds.has(a.id) && a.payment_status === "paid")
    .map(a => {
      const split = resolveSplit({ grossAmount: Number(a.amount || 0), appointmentId: a.id, paymentStatus: a.payment_status });
      return {
        date: a.date || today,
        gross: split.gross,
        commission_amount: split.commission_amount,
        net_amount: split.net_amount,
        isRefunded: split.isRefunded,
      };
    })
    .filter(entry => !entry.isRefunded);

  const revenueEntries: RevenueEntry[] = [...activeInvoiceEntries, ...uninvoicedPaidEntries];

  const todayRev = revenueEntries
    .filter((e) => e.date === dayCardDate)
    .reduce((s, e) => s + e.gross, 0);
  const weekRev = revenueEntries
    .filter((e) => e.date >= weekStart && e.date <= weekEnd)
    .reduce((s, e) => s + e.gross, 0);
  const periodRevenueEntries = !periodActive
    ? revenueEntries
    : revenueEntries.filter((e) => e.date >= monthCardStart && e.date <= monthCardEnd);
  const monthRev = periodRevenueEntries.reduce((s, e) => s + e.gross, 0);

  const totalGrossRev = revenueEntries.reduce((s, e) => s + e.gross, 0);
  const totalPlatformCharges = +revenueEntries.reduce((s, e) => s + e.commission_amount, 0).toFixed(2);
  const totalNetCredited = +revenueEntries.reduce((s, e) => s + e.net_amount, 0).toFixed(2);
  const periodNetRev = +periodRevenueEntries.reduce((s, e) => s + e.net_amount, 0).toFixed(2);
  const periodCommission = +periodRevenueEntries.reduce((s, e) => s + e.commission_amount, 0).toFixed(2);

  // Persisted transaction rows are built from the invoices table (which
  // survives appointment/patient deletion via ON DELETE SET NULL). We then
  // append appointments that haven't been invoiced yet (pending / pay-at-
  // clinic / refunded / uninvoiced paid) so the doctor still sees open items.
  type TxRow = {
    key: string;
    patient_name: string;
    service_name: string;
    date: string;
    amount: number;
    commission_percent: number;
    commission_amount: number;
    net_amount: number;
    settlement_status: "settled" | "pending_settlement" | "failed" | "refunded" | "pay_at_clinic";
    settlement_label: string;
    payment_status: "paid" | "pending" | "refunded" | "pay_at_clinic";
    status: string;
    is_mock: boolean;
  };

  const invoiceTx: TxRow[] = invoices.map(i => {
    const split = resolveSplit({ grossAmount: Number(i.amount || 0), appointmentId: i.appointment_id, inv: i });
    return {
      key: `inv-${i.id}`,
      patient_name: i.patient_name,
      service_name: i.service_name,
      date: invoiceDate(i),
      amount: split.gross,
      commission_percent: split.commission_percent,
      commission_amount: split.commission_amount,
      net_amount: split.net_amount,
      settlement_status: split.settlement_status,
      settlement_label: split.settlement_label,
      payment_status: split.isRefunded ? "refunded" : "paid",
      status: split.isRefunded ? "cancelled" : "completed",
      is_mock: apptGatewayById.get(i.appointment_id) === "razorpay_mock",
    };
  });
  const openApptTx: TxRow[] = appointments
    .filter(a => !invoicedApptIds.has(a.id))
    .map(a => {
      const split = resolveSplit({
        grossAmount: Number(a.amount || 0),
        appointmentId: a.id,
        paymentStatus: a.payment_status,
      });
      const paymentStatus: TxRow["payment_status"] = split.isRefunded
        ? "refunded"
        : (a.payment_status || "pending");
      return {
        key: `apt-${a.id}`,
        patient_name: a.patient_name,
        service_name: a.service_name,
        date: a.date,
        amount: split.gross,
        commission_percent: paymentStatus === "paid" || paymentStatus === "refunded" ? split.commission_percent : 0,
        commission_amount: paymentStatus === "paid" || paymentStatus === "refunded" ? split.commission_amount : 0,
        net_amount: paymentStatus === "paid" || paymentStatus === "refunded" ? split.net_amount : split.gross,
        settlement_status: split.settlement_status,
        settlement_label:
          paymentStatus === "pay_at_clinic"
            ? "Pay at Clinic (0% fee)"
            : paymentStatus === "refunded"
            ? "Refunded"
            : paymentStatus === "paid"
            ? split.settlement_label
            : "Pending Payment",
        payment_status: paymentStatus,
        status: a.status,
        is_mock: a.payment_gateway === "razorpay_mock",
      };
    });
  const transactions: TxRow[] = [...invoiceTx, ...openApptTx].sort(
    (a, b) => (b.date || "").localeCompare(a.date || "")
  );

  // The Month navigator can't go past the real current month, and can't go
  // earlier than the doctor's very first transaction.
  const currentMonthKey = format(new Date(), "yyyy-MM");
  const selectedMonthKey = format(selectedMonth, "yyyy-MM");
  const earliestTxDate = transactions.reduce((min, t) => (t.date && t.date < min ? t.date : min), today);
  const earliestMonthKey = earliestTxDate.slice(0, 7);
  const canGoPrevMonth = selectedMonthKey > earliestMonthKey;
  const canGoNextMonth = selectedMonthKey < currentMonthKey;
  const monthYearOptions = (() => {
    const startYear = Number(earliestMonthKey.slice(0, 4));
    const endYear = Number(currentMonthKey.slice(0, 4));
    const years: number[] = [];
    for (let y = endYear; y >= startYear; y--) years.push(y);
    return years;
  })();
  const jumpToYear = (year: number) => {
    setSelectedMonth((d) => {
      const next = new Date(year, d.getMonth(), 1);
      const nextKey = format(next, "yyyy-MM");
      if (nextKey > currentMonthKey) return startOfMonth(new Date());
      if (nextKey < earliestMonthKey) return new Date(Number(earliestMonthKey.slice(0, 4)), Number(earliestMonthKey.slice(5, 7)) - 1, 1);
      return next;
    });
  };

  const statusFiltered = filter === "all" ? transactions : transactions.filter(t => t.payment_status === filter);

  const filtered = !periodActive
    ? statusFiltered
    : periodMode === "month"
    ? statusFiltered.filter(t => t.date >= selectedMonthStart && t.date <= selectedMonthEnd)
    : statusFiltered.filter(t => t.date === selectedDateStr);

  const totalCount = filtered.length;
  const pageStart = (page - 1) * PAGE_SIZE;
  const paginated = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  const paidCount = transactions.filter(t => t.payment_status === "paid").length;
  const pendingCount = transactions.filter(t => t.payment_status === "pending").length;
  const clinicCount = transactions.filter(t => t.payment_status === "pay_at_clinic").length;
  const refundedCount = transactions.filter(t => t.payment_status === "refunded").length;
  const donutTotal = transactions.length || 1;

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
    { label: dayCardLabel, value: todayRev, icon: Calendar, gradient: "from-royal to-teal" },
    { label: weekCardLabel, value: weekRev, icon: TrendingUp, gradient: "from-teal to-success" },
    { label: monthCardLabel, value: monthRev, icon: IndianRupee, gradient: "from-success to-royal" },
  ];

  const exportTransactionsCSV = () => {
    const rows = filtered.map(a => ({
      "Patient Name": a.patient_name,
      "Service": a.service_name,
      "Date": a.date,
      "Gross Amount (INR)": a.amount,
      "Platform Charge %": a.commission_percent,
      "Platform Charge (INR)": a.commission_amount,
      "Net Credited (INR)": a.net_amount,
      "Settlement Status": a.settlement_label,
      "Payment Status": a.payment_status,
      "Appointment Status": a.status,
      "Mock": a.is_mock ? "yes" : "no",
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
          description="Track revenue, auto-generate GST invoices, and export transactions. Available on Pro and Premium."
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

      {/* Platform Charge & Net Credited Breakdown Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-border/60 shadow-none">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Gross Revenue</span>
              <IndianRupee className="h-3.5 w-3.5 text-royal" />
            </div>
            <div className="font-heading font-bold text-xl text-foreground mt-1" data-testid="summary-gross-revenue">
              ₹{totalGrossRev.toLocaleString("en-IN")}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Total paid by patients (excl. refunded)
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-none">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Platform Charges</span>
              <Percent className="h-3.5 w-3.5 text-warning" />
            </div>
            <div className="font-heading font-bold text-xl text-warning mt-1" data-testid="summary-platform-charges">
              -₹{totalPlatformCharges.toLocaleString("en-IN")}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Period: -₹{periodCommission.toLocaleString("en-IN")} deducted by Doctylia
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-none">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Net Credited to You</span>
              <Wallet className="h-3.5 w-3.5 text-success" />
            </div>
            <div className="font-heading font-bold text-xl text-success mt-1" data-testid="summary-net-credited">
              ₹{totalNetCredited.toLocaleString("en-IN")}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Routed to your Linked Account
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-none">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{monthCardLabel === "This Month" ? "This Month's Net Earnings" : `${monthCardLabel} Net Earnings`}</span>
              <ArrowDownRight className="h-3.5 w-3.5 text-teal" />
            </div>
            <div className="font-heading font-bold text-xl text-foreground mt-1" data-testid="summary-period-net">
              ₹{periodNetRev.toLocaleString("en-IN")}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Net after platform charges ({monthCardLabel})
            </div>
          </CardContent>
        </Card>
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

              <div className="flex flex-wrap items-center gap-2">
                <Card className="border-border/60 shadow-none">
                  <CardContent className="p-2 flex items-center gap-2">
                    <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/40 shrink-0">
                      <Button
                        type="button" size="sm" variant={periodMode === "month" ? "default" : "ghost"}
                        className="h-8 px-3 text-xs"
                        onClick={() => setPeriodMode("month")}
                      >
                        Month
                      </Button>
                      <Button
                        type="button" size="sm" variant={periodMode === "date" ? "default" : "ghost"}
                        className="h-8 px-3 text-xs"
                        onClick={() => setPeriodMode("date")}
                      >
                        Date
                      </Button>
                    </div>

                    {periodMode === "month" && periodActive && (
                      <Select value={String(selectedMonth.getFullYear())} onValueChange={(y) => jumpToYear(Number(y))}>
                        <SelectTrigger className="h-8 w-[80px] text-xs font-medium"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {monthYearOptions.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </CardContent>
                </Card>

                {periodMode === "month" ? (
                  <Card className="border-border/60 shadow-none">
                    <CardContent className="p-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {periodActive ? (
                          <>
                            <Button
                              variant="outline" size="icon" className="h-9 w-9 shrink-0" aria-label="Previous month"
                              disabled={!canGoPrevMonth}
                              onClick={() => canGoPrevMonth && setSelectedMonth((d) => subMonths(d, 1))}
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <span className="text-sm font-semibold text-foreground whitespace-nowrap px-1 min-w-[6.5rem] text-center">
                              {format(selectedMonth, "MMMM yyyy")}
                            </span>
                            <Button
                              variant="outline" size="icon" className="h-9 w-9 shrink-0" aria-label="Next month"
                              disabled={!canGoNextMonth}
                              onClick={() => canGoNextMonth && setSelectedMonth((d) => addMonths(d, 1))}
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-royal" onClick={() => setPeriodActive(false)}>
                              <X className="h-3 w-3" /> Clear
                            </Button>
                          </>
                        ) : (
                          <>
                            <span className="text-xs text-muted-foreground px-1">Showing all transactions</span>
                            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setSelectedMonth(new Date()); setPeriodActive(true); }}>
                              This Month
                            </Button>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <DateFilter
                    selectedDate={selectedDate}
                    dateFilterActive={periodActive}
                    calendarOpen={calendarOpen}
                    onCalendarOpenChange={setCalendarOpen}
                    onDateChange={(date) => { setSelectedDate(date); setPeriodActive(true); setCalendarOpen(false); }}
                    onClear={() => setPeriodActive(false)}
                    activeLabel="Showing"
                    inactiveLabel="Showing all transactions"
                  />
                )}
              </div>

              {totalCount === 0 ? (
                <Card className="border-border/60 shadow-none">
                  <CardContent className="py-16 text-center">
                    <CreditCard className="h-12 w-12 text-success/20 mx-auto mb-3" />
                    <p className="text-muted-foreground font-medium">
                      {transactions.length === 0 ? "No transactions yet" : "No transactions in this period"}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="space-y-2">
                    {paginated.map((a) => {
                      const pc = paymentColors[a.payment_status] || paymentColors.pending;
                      const showCommissionBreakdown = a.payment_status === "paid" || a.payment_status === "refunded";
                      const settlementBadgeClass =
                        a.settlement_status === "settled"
                          ? "bg-success/10 text-success border-success/20"
                          : a.settlement_status === "pending_settlement"
                          ? "bg-warning/10 text-warning border-warning/20"
                          : a.settlement_status === "failed" || a.settlement_status === "refunded"
                          ? "bg-destructive/10 text-destructive border-destructive/20"
                          : "bg-royal/10 text-royal border-royal/20";
                      return (
                        <Card key={a.key} className="border-border/60 shadow-none hover:shadow-sm transition-shadow">
                          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center text-sm font-bold text-success flex-shrink-0">
                                {a.patient_name?.charAt(0)?.toUpperCase() || "P"}
                              </div>
                              <div className="space-y-1">
                                <div className="font-medium text-foreground text-sm">{a.patient_name}</div>
                                <div className="text-xs text-muted-foreground">{a.service_name} · {a.date}</div>
                                {showCommissionBreakdown ? (
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground pt-0.5">
                                    <span>Gross ₹{a.amount.toLocaleString("en-IN")}</span>
                                    <span>·</span>
                                    <span className="text-warning font-medium">
                                      Platform Charge {a.commission_percent}% (-₹{a.commission_amount.toLocaleString("en-IN")})
                                    </span>
                                    <span>·</span>
                                    <span className={a.payment_status === "refunded" ? "text-destructive line-through" : "text-success font-semibold"}>
                                      Net Credited ₹{a.net_amount.toLocaleString("en-IN")}
                                    </span>
                                  </div>
                                ) : a.payment_status === "pay_at_clinic" ? (
                                  <div className="text-[11px] text-muted-foreground pt-0.5">
                                    Pay at Clinic (0% fee) · Net Credited ₹{a.net_amount.toLocaleString("en-IN")}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 sm:gap-3 flex-wrap flex-shrink-0">
                              <Badge variant="outline" className={`text-[10px] ${pc.bg} ${pc.text}`}>{pc.label}</Badge>
                              {(a.payment_status === "paid" || a.payment_status === "pay_at_clinic") && (
                                <Badge variant="outline" className={`text-[10px] ${settlementBadgeClass}`}>
                                  {a.settlement_label}
                                </Badge>
                              )}
                              <Badge variant="outline" className={`text-[10px] capitalize ${statusColors[a.status] || ""}`}>{a.status}</Badge>
                              {a.is_mock && <TestModeBadge />}
                              <div className="text-right">
                                <span className="font-heading font-bold text-foreground">
                                  ₹{(a.payment_status === "paid" ? a.net_amount : a.amount).toLocaleString("en-IN")}
                                </span>
                                {a.payment_status === "paid" && a.commission_amount > 0 && (
                                  <div className="text-[10px] text-muted-foreground">
                                    of ₹{a.amount.toLocaleString("en-IN")}
                                  </div>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                  <PaginationBar page={page} totalCount={totalCount} onPageChange={setPage} />
                </>
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
                  total={donutTotal}
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
                      <Badge
                        variant="outline"
                        className={`text-[10px] capitalize ${
                          inv.status === "refunded" ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"
                        }`}
                      >
                        {inv.status}
                      </Badge>
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
