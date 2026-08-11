import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreditCard, TrendingUp, Calendar, IndianRupee, Wallet, PieChart, Download, FileText } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import StatCard from "@/components/shared/StatCard";
import PaymentStatusDonut, { type DonutSegment } from "@/components/shared/PaymentStatusDonut";
import TestModeBadge from "@/components/shared/TestModeBadge";
import {
  bucketPaymentStatus,
  computeRevenueTotals,
  computeEstimatedMRR,
  type PaymentTxnStatus,
  type PaymentStatusBucket,
} from "@/lib/subscriptionRevenue";

interface UpgradePaymentRow {
  id: string;
  doctor_id: string;
  from_tier: string;
  target_tier: string;
  amount: number;
  status: PaymentTxnStatus;
  is_mock: boolean;
  created_at: string;
  profiles: { full_name: string | null; clinic_name: string | null } | null;
}

interface SubscriberProfileRow {
  plan_status: string | null;
  plan_tier: string | null;
  custom_plan_price: number | null;
}

type StatusFilter = "all" | PaymentStatusBucket;
const STATUS_FILTERS: StatusFilter[] = ["all", "Paid", "Pending", "Failed", "Refunded"];

const BADGE_CLASS: Record<PaymentStatusBucket, string> = {
  Paid: "bg-success/10 text-success",
  Pending: "bg-warning/10 text-warning",
  Failed: "bg-destructive/10 text-destructive",
  Refunded: "bg-royal/10 text-royal",
};

const SABilling = () => {
  const [payments, setPayments] = useState<UpgradePaymentRow[]>([]);
  const [subscribers, setSubscribers] = useState<SubscriberProfileRow[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("all");

  const loadPayments = async () => {
    const { data, error } = await supabase
      .from("plan_upgrade_payments")
      .select("id, doctor_id, from_tier, target_tier, amount, status, is_mock, created_at, profiles(full_name, clinic_name)")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Failed to load subscription payments", description: error.message, variant: "destructive" });
      return;
    }
    setPayments((data ?? []) as unknown as UpgradePaymentRow[]);
  };

  const loadSubscribers = async () => {
    const { data } = await supabase.from("profiles").select("plan_status, plan_tier, custom_plan_price");
    setSubscribers((data ?? []) as SubscriberProfileRow[]);
  };

  useEffect(() => {
    loadPayments();
    loadSubscribers();
  }, []);

  // Realtime: keep the platform-wide payment list current without a manual refresh.
  useEffect(() => {
    const channel = supabase
      .channel("sa-billing-plan-upgrade-payments")
      .on("postgres_changes", { event: "*", schema: "public", table: "plan_upgrade_payments" }, () => loadPayments())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = computeRevenueTotals(payments);
  const estimatedMRR = computeEstimatedMRR(subscribers);

  const statCards = [
    { label: "Today's Subscription Revenue", value: `₹${totals.today.toLocaleString("en-IN")}`, icon: Calendar, gradient: "from-royal to-teal" },
    { label: "This Week", value: `₹${totals.week.toLocaleString("en-IN")}`, icon: TrendingUp, gradient: "from-teal to-success" },
    { label: "This Month", value: `₹${totals.month.toLocaleString("en-IN")}`, icon: IndianRupee, gradient: "from-success to-royal" },
    { label: "Estimated MRR", value: `₹${estimatedMRR.toLocaleString("en-IN")}`, icon: Wallet, gradient: "from-spark to-royal" },
  ];

  const bucketed = payments.map((p) => ({ ...p, bucket: bucketPaymentStatus(p.status) }));
  const filtered = filter === "all" ? bucketed : bucketed.filter((p) => p.bucket === filter);

  const bucketCounts: Record<PaymentStatusBucket, number> = { Paid: 0, Pending: 0, Failed: 0, Refunded: 0 };
  bucketed.forEach((p) => {
    bucketCounts[p.bucket] += 1;
  });
  const donutBuckets: DonutSegment[] = [
    { label: "Paid", count: bucketCounts.Paid, color: "hsl(var(--success))" },
    { label: "Pending", count: bucketCounts.Pending, color: "hsl(var(--warning))" },
    { label: "Failed", count: bucketCounts.Failed, color: "hsl(var(--destructive))" },
    { label: "Refunded", count: bucketCounts.Refunded, color: "hsl(var(--royal))" },
  ];

  const exportTransactionsCSV = () => {
    const rows = filtered.map((p) => ({
      "Doctor Name": p.profiles?.full_name || "",
      Clinic: p.profiles?.clinic_name || "",
      "From Tier": p.from_tier,
      "Target Tier": p.target_tier,
      "Amount (INR)": p.amount,
      Status: p.status,
      Mock: p.is_mock ? "yes" : "no",
      Date: p.created_at,
    }));
    if (rows.length === 0) {
      toast({ title: "No transactions to export", variant: "destructive" });
      return;
    }
    const headers = Object.keys(rows[0]);
    const escape = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => escape((r as Record<string, unknown>)[h])).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `doctylia-subscription-revenue-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Transactions exported" });
  };

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((c) => (
          <StatCard key={c.label} {...c} />
        ))}
      </div>

      <Tabs defaultValue="transactions" className="space-y-5">
        <TabsList className="bg-card border border-border h-11">
          <TabsTrigger value="transactions" className="gap-1.5">
            <CreditCard className="h-3.5 w-3.5" /> Transactions
          </TabsTrigger>
          <TabsTrigger value="invoices" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" /> Invoices
          </TabsTrigger>
        </TabsList>

        <TabsContent value="transactions" className="space-y-4">
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="font-heading font-semibold text-lg text-foreground">Transactions</h2>
                <div className="flex items-center gap-2">
                  <Select value={filter} onValueChange={(v) => setFilter(v as StatusFilter)}>
                    <SelectTrigger className="w-44 h-9">
                      <SelectValue placeholder="Payment Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Payments</SelectItem>
                      {STATUS_FILTERS.filter((s) => s !== "all").map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
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
                    <p className="text-muted-foreground font-medium">No subscription payments yet</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {filtered.map((p) => (
                    <Card key={p.id} className="border-border/60 shadow-none hover:shadow-sm transition-shadow">
                      <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-royal/10 flex items-center justify-center text-sm font-bold text-royal flex-shrink-0">
                            {p.profiles?.full_name?.charAt(0)?.toUpperCase() || "D"}
                          </div>
                          <div>
                            <div className="font-medium text-foreground text-sm">{p.profiles?.full_name || p.doctor_id}</div>
                            <div className="text-xs text-muted-foreground capitalize">
                              {p.from_tier} → {p.target_tier} · {new Date(p.created_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 flex-wrap flex-shrink-0">
                          <Badge variant="outline" className={`text-[10px] ${BADGE_CLASS[p.bucket]}`}>
                            {p.bucket}
                          </Badge>
                          {p.is_mock && <TestModeBadge />}
                          <span className="font-heading font-bold text-foreground">₹{p.amount}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
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
                <PaymentStatusDonut buckets={donutBuckets} total={payments.length} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="invoices">
          <Card className="border-border/60 shadow-none">
            <CardContent className="py-16 text-center">
              <FileText className="h-12 w-12 text-royal/20 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">Subscription invoicing is coming soon</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SABilling;
