import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { CreditCard, TrendingUp, Calendar, IndianRupee, PieChart } from "lucide-react";
import { format, startOfWeek, startOfMonth, endOfWeek, endOfMonth } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const BillingPage = () => {
  const { profile } = useProfile();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (!profile) return;
    supabase.from("appointments").select("*").eq("doctor_id", profile.id).order("date", { ascending: false }).then(({ data }) => {
      setAppointments(data || []);
    });
  }, [profile]);

  const today = format(new Date(), "yyyy-MM-dd");
  const weekStart = format(startOfWeek(new Date()), "yyyy-MM-dd");
  const weekEnd = format(endOfWeek(new Date()), "yyyy-MM-dd");
  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd");

  const paid = appointments.filter((a) => a.payment_status === "paid");
  const todayRev = paid.filter((a) => a.date === today).reduce((s, a) => s + a.amount, 0);
  const weekRev = paid.filter((a) => a.date >= weekStart && a.date <= weekEnd).reduce((s, a) => s + a.amount, 0);
  const monthRev = paid.filter((a) => a.date >= monthStart && a.date <= monthEnd).reduce((s, a) => s + a.amount, 0);

  const filtered = filter === "all" ? appointments : appointments.filter((a) => a.payment_status === filter);

  // Payment distribution for donut
  const paidCount = appointments.filter(a => a.payment_status === "paid").length;
  const pendingCount = appointments.filter(a => a.payment_status === "pending").length;
  const clinicCount = appointments.filter(a => a.payment_status === "pay_at_clinic").length;
  const refundedCount = appointments.filter(a => a.payment_status === "refunded").length;
  const totalCount = appointments.length || 1;

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

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h1 className="font-heading font-bold text-2xl text-primary flex items-center gap-2">
        <CreditCard className="h-6 w-6 text-success" /> Billing & Revenue
      </h1>

      {/* Revenue Cards */}
      <div className="grid sm:grid-cols-3 gap-4">
        {revenueCards.map((r) => (
          <Card key={r.label} className="border-0 shadow-none overflow-hidden">
            <CardContent className={`p-5 bg-gradient-to-br ${r.gradient} text-white relative`}>
              <div className="absolute top-3 right-3 opacity-20">
                <r.icon className="h-12 w-12" />
              </div>
              <div className="relative z-10">
                <div className="text-sm font-medium text-white/80">{r.label}</div>
                <div className="font-heading font-extrabold text-2xl mt-1">₹{r.value.toLocaleString("en-IN")}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Transaction List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-heading font-semibold text-lg text-foreground">Transactions</h2>
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
                  <Card key={a.id} className="border-border/60 shadow-none hover:shadow-sm transition-shadow">
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

        {/* Payment Distribution Donut */}
        <Card className="border-border/60 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <PieChart className="h-4 w-4 text-royal" /> Payment Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* CSS Donut Chart */}
            <div className="relative w-40 h-40 mx-auto mb-4">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="15.915" fill="none" stroke="hsl(var(--secondary))" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.915" fill="none" stroke="hsl(var(--success))" strokeWidth="3"
                  strokeDasharray={`${(paidCount / totalCount) * 100} ${100 - (paidCount / totalCount) * 100}`}
                  strokeDashoffset="0" />
                <circle cx="18" cy="18" r="15.915" fill="none" stroke="hsl(var(--warning))" strokeWidth="3"
                  strokeDasharray={`${(pendingCount / totalCount) * 100} ${100 - (pendingCount / totalCount) * 100}`}
                  strokeDashoffset={`${-(paidCount / totalCount) * 100}`} />
                <circle cx="18" cy="18" r="15.915" fill="none" stroke="hsl(var(--royal))" strokeWidth="3"
                  strokeDasharray={`${(clinicCount / totalCount) * 100} ${100 - (clinicCount / totalCount) * 100}`}
                  strokeDashoffset={`${-((paidCount + pendingCount) / totalCount) * 100}`} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="font-heading font-bold text-xl text-foreground">{totalCount}</div>
                  <div className="text-[10px] text-muted-foreground">Total</div>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {[
                { label: "Paid", count: paidCount, color: "bg-success" },
                { label: "Pending", count: pendingCount, color: "bg-warning" },
                { label: "Pay at Clinic", count: clinicCount, color: "bg-royal" },
                { label: "Refunded", count: refundedCount, color: "bg-destructive" },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                    <span className="text-muted-foreground text-xs">{item.label}</span>
                  </div>
                  <span className="font-medium text-foreground text-xs">{item.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default BillingPage;
