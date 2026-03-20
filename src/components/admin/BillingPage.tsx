import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { CreditCard, TrendingUp, Calendar } from "lucide-react";
import { format, startOfWeek, startOfMonth, endOfWeek, endOfMonth } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

  const paymentColors: Record<string, string> = {
    paid: "bg-success/10 text-success",
    pending: "bg-warning/10 text-warning",
    refunded: "bg-destructive/10 text-destructive",
    pay_at_clinic: "bg-royal/10 text-royal",
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h1 className="font-heading font-bold text-2xl text-primary flex items-center gap-2">
        <CreditCard className="h-6 w-6 text-success" /> Billing & Revenue
      </h1>

      {/* Revenue Cards */}
      <div className="grid sm:grid-cols-3 gap-4">
        {[
          { label: "Today", value: todayRev, icon: Calendar },
          { label: "This Week", value: weekRev, icon: TrendingUp },
          { label: "This Month", value: monthRev, icon: CreditCard },
        ].map((r) => (
          <div key={r.label} className="bg-card rounded-xl p-5 border border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                <r.icon className="h-5 w-5 text-success" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">{r.label}</div>
                <div className="font-heading font-bold text-xl text-primary">₹{r.value.toLocaleString("en-IN")}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex justify-end">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Payment Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Payments</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
            <SelectItem value="pay_at_clinic">Pay at Clinic</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Transactions Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Patient</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Service</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Amount</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Payment</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">No transactions yet.</td></tr>
              ) : filtered.map((a) => (
                <tr key={a.id} className="border-b border-border hover:bg-secondary/50">
                  <td className="px-4 py-3 font-medium text-primary">{a.patient_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{a.service_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{a.date}</td>
                  <td className="px-4 py-3 font-medium">₹{a.amount}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-pill font-medium ${paymentColors[a.payment_status] || ""}`}>{a.payment_status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-pill font-medium ${
                      a.status === "completed" ? "bg-success/10 text-success" :
                      a.status === "cancelled" ? "bg-destructive/10 text-destructive" :
                      "bg-warning/10 text-warning"
                    }`}>{a.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default BillingPage;
