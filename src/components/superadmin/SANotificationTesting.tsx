import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNotificationMode } from "@/hooks/useNotificationMode";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FlaskConical, Radio } from "lucide-react";
import { NOTIFICATION_STATUS_LABEL, NOTIFICATION_STATUS_CLASS, CHANNEL_LABEL } from "@/lib/checkupReminders";

type LogRow = {
  id: string; channel: string; message: string; status: string; is_test: boolean;
  recipient: string | null; created_at: string; patients: { name: string } | null;
};

const SANotificationTesting = () => {
  const { mode } = useNotificationMode();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [channelFilter, setChannelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    supabase
      .from("notification_logs")
      .select("id, channel, message, status, is_test, recipient, created_at, patients(name)")
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data }) => setRows((data || []) as unknown as LogRow[]));
  }, []);

  const filtered = rows.filter((r) => {
    if (channelFilter !== "all" && r.channel !== channelFilter) return false;
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    return true;
  });

  const counts = {
    pending: rows.filter((r) => r.status === "pending" || r.status === "processing").length,
    simulated: rows.filter((r) => r.status === "simulated").length,
    failed: rows.filter((r) => r.status === "failed").length,
    sent: rows.filter((r) => r.status === "sent").length,
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-heading font-bold text-2xl text-primary flex items-center gap-2">
          <FlaskConical className="h-6 w-6 text-royal" /> Notification Testing
        </h1>
        <Badge variant="secondary" className={`gap-1.5 text-xs ${mode === "live" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
          <Radio className="h-3 w-3" /> Notification Mode: {mode ? mode.toUpperCase() : "…"}
        </Badge>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Pending", value: counts.pending, bg: "bg-warning/10", color: "text-warning" },
          { label: "Total Simulated", value: counts.simulated, bg: "bg-ai-purple/10", color: "text-ai-purple" },
          { label: "Total Failed", value: counts.failed, bg: "bg-destructive/10", color: "text-destructive" },
          { label: "Total Sent", value: counts.sent, bg: "bg-success/10", color: "text-success" },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} rounded-xl p-3 text-center`}>
            <div className={`font-heading font-bold text-xl ${s.color}`}>{s.value}</div>
            <div className="text-[11px] text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All channels</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
            <SelectItem value="in_app">In-App</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="simulated">Simulated</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">Patient</th>
                <th className="text-left p-3">Channel</th>
                <th className="text-left p-3">Message</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="p-3 text-xs font-medium">{r.patients?.name || "—"}</td>
                  <td className="p-3 text-xs">
                    {CHANNEL_LABEL[r.channel as keyof typeof CHANNEL_LABEL] || r.channel}
                    {r.is_test && <Badge variant="secondary" className="ml-1.5 text-[9px]">Test</Badge>}
                  </td>
                  <td className="p-3 text-xs max-w-md"><span className="line-clamp-2 text-muted-foreground">{r.message}</span></td>
                  <td className="p-3 text-xs">
                    <Badge variant="secondary" className={`text-[10px] ${NOTIFICATION_STATUS_CLASS[r.status as keyof typeof NOTIFICATION_STATUS_CLASS] || ""}`}>
                      {NOTIFICATION_STATUS_LABEL[r.status as keyof typeof NOTIFICATION_STATUS_LABEL] || r.status}
                    </Badge>
                  </td>
                  <td className="p-3 text-xs whitespace-nowrap text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No notifications yet.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
};

export default SANotificationTesting;
