import { useEffect, useMemo, useState } from "react";
import { Video, Loader2, Clock, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  appointmentId: string;
  date: string; // YYYY-MM-DD
  timeSlot: string; // HH:mm(:ss)
  role: "doctor" | "patient";
  status?: string;
  hasMeeting?: boolean;
  patientToken?: string;
  patientPhone?: string;
  onCreated?: () => void;
}

function scheduledAt(date: string, timeSlot: string) {
  const t = timeSlot.length === 5 ? `${timeSlot}:00` : timeSlot;
  return new Date(`${date}T${t}`);
}

export default function VideoConsultationCard({
  appointmentId, date, timeSlot, role, status, hasMeeting,
  patientToken, patientPhone, onCreated,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const target = useMemo(() => scheduledAt(date, timeSlot).getTime(), [date, timeSlot]);
  const minutesUntil = Math.round((target - now) / 60_000);
  const withinWindow = minutesUntil <= 15; // opens 15 min before, no upper limit
  const isCancelled = status === "cancelled";
  const isCompleted = status === "completed";
  const disabled = loading || isCancelled || isCompleted || !withinWindow;

  const label = role === "doctor" ? "Start Meeting" : "Join Meeting";

  const handleClick = async () => {
    setLoading(true);
    try {
      const action = role === "doctor" ? "create" : "get";
      const body: Record<string, unknown> = { appointment_id: appointmentId, action };
      if (role === "patient") {
        body.patient_token = patientToken;
        body.patient_phone = patientPhone;
      }
      const { data, error } = await supabase.functions.invoke("create-zoom-meeting", { body });
      if (error) throw new Error(error.message || "Failed to reach meeting service");
      if (!data || (data as any).error) throw new Error((data as any)?.error || "Meeting unavailable");
      const url = role === "doctor" ? (data as any).start_url : (data as any).join_url;
      if (!url) throw new Error("Meeting link not returned");
      window.open(url, "_blank", "noopener,noreferrer");
      onCreated?.();
    } catch (e) {
      const msg = (e as Error).message || "Something went wrong";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  let statusText = "";
  if (isCancelled) statusText = "Appointment cancelled";
  else if (isCompleted) statusText = "Consultation completed";
  else if (!withinWindow) {
    if (minutesUntil > 60 * 24) statusText = `Opens 15 min before start`;
    else if (minutesUntil > 60) statusText = `Opens in ${Math.floor(minutesUntil / 60)}h ${minutesUntil % 60}m`;
    else statusText = `Opens in ${minutesUntil - 15} min`;
  } else {
    statusText = role === "doctor"
      ? (hasMeeting ? "Ready to host" : "Click to generate & start")
      : "Meeting is open";
  }

  return (
    <Card className="border-teal/20 bg-teal/5">
      <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-teal/15 text-teal flex items-center justify-center shrink-0">
            <Video className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">Video Consultation</span>
              <Badge variant="outline" className="text-[10px] bg-white">Zoom</Badge>
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <Clock className="h-3 w-3" /> {statusText}
            </div>
          </div>
        </div>
        <Button
          size="sm"
          onClick={handleClick}
          disabled={disabled}
          className="bg-teal hover:bg-teal/90 text-white shrink-0"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ExternalLink className="h-4 w-4 mr-1" />}
          {label}
        </Button>
      </CardContent>
    </Card>
  );
}
