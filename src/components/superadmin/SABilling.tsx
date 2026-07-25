import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Info } from "lucide-react";

const SABilling = () => {
  const [data, setData] = useState<{ month: string; total: number }[]>([]);

  useEffect(() => {
    supabase.from("invoices").select("total_amount, created_at").then(({ data }) => {
      const byMonth = new Map<string, number>();
      (data ?? []).forEach((r: any) => {
        const d = new Date(r.created_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        byMonth.set(key, (byMonth.get(key) || 0) + Number(r.total_amount || 0));
      });
      setData(Array.from(byMonth.entries()).sort().map(([month, total]) => ({ month, total })));
    });
  }, []);

  return (
    <div className="space-y-4">
      <Card className="border-royal/30 bg-royal/5">
        <CardContent className="p-4 flex items-start gap-3">
          <Info className="h-5 w-5 text-royal flex-shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            Doctylia's own subscription billing from doctors will appear here once Razorpay is connected.
            The chart below is <strong>Patient Billing Volume Across Platform</strong> — sum of all invoices doctors have generated for their patients.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Patient billing volume — monthly</CardTitle></CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="month" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip formatter={(v: number) => `₹${v.toLocaleString("en-IN")}`} />
                <Bar dataKey="total" fill="hsl(var(--royal))" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SABilling;
