import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format, addDays, differenceInHours, parseISO } from "date-fns";
import { CalendarCheck, Clock, Users, ChevronLeft, XCircle, RefreshCw, Loader2, ArrowRight } from "lucide-react";
import { useSlotAvailability } from "@/hooks/useSlotAvailability";

type Appt = {
  id: string; doctor_id: string; patient_name: string; patient_phone: string;
  service_name: string; appointment_type: string; date: string; time_slot: string;
  status: string; token_number: string; amount: number; reschedule_count: number;
  chief_complaint: string | null; meeting_link: string | null; created_at: string;
};

const generateTimeSlots = (start: string | null, end: string | null) => {
  if (!start || !end) return [] as string[];
  const slots: string[] = [];
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let current = sh * 60 + sm;
  const endMin = eh * 60 + em;
  while (current < endMin) {
    const h = Math.floor(current / 60);
    const m = current % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    current += 30;
  }
  return slots;
};

const ManageAppointment = () => {
  const { slug } = useParams<{ slug: string }>();
  const [params] = useSearchParams();
  const [doctor, setDoctor] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [workingHours, setWorkingHours] = useState<any[]>([]);
  const [token, setToken] = useState(params.get("token") || "");
  const [phone, setPhone] = useState(params.get("phone") || "");
  const [loading, setLoading] = useState(false);
  const [appt, setAppt] = useState<Appt | null>(null);
  const [queuePos, setQueuePos] = useState<number | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [newDate, setNewDate] = useState<Date | null>(null);
  const [newTime, setNewTime] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      const { data: prof } = await supabase.from("profiles").select("*").eq("slug", slug).eq("onboarding_completed", true).single();
      if (!prof) return;
      setDoctor(prof);
      const [s, wh] = await Promise.all([
        supabase.from("website_settings").select("*").eq("doctor_id", prof.id).single(),
        supabase.from("working_hours").select("*").eq("doctor_id", prof.id).order("day_of_week"),
      ]);
      setSettings(s.data);
      setWorkingHours(wh.data || []);
    })();
  }, [slug]);

  const lookup = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!doctor || !token || !phone) return;
    setLoading(true);
    const { data } = await (supabase as any).rpc("get_appointment_by_token", {
      _doctor_id: doctor.id, _token: token.trim(), _phone: phone.trim(),
    });
    setLoading(false);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      toast.error("No appointment found with that token and phone number.");
      setAppt(null);
      return;
    }
    setAppt(row as Appt);
    refreshQueue(row.id);
  };

  // Auto-lookup if URL has token+phone
  useEffect(() => {
    if (doctor && token && phone && !appt) lookup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctor]);

  const refreshQueue = async (id: string) => {
    const { data } = await (supabase as any).rpc("get_queue_position", { _appointment_id: id });
    setQueuePos(typeof data === "number" ? data : 0);
  };

  // Realtime queue updates
  useEffect(() => {
    if (!appt || !doctor) return;
    const channel = supabase
      .channel(`manage-${appt.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "appointments", filter: `doctor_id=eq.${doctor.id}` },
        () => {
          refreshQueue(appt.id);
          // Refresh appt itself to catch status/date changes
          (supabase as any).rpc("get_appointment_by_token", {
            _doctor_id: doctor.id, _token: appt.token_number, _phone: appt.patient_phone,
          }).then(({ data }: any) => {
            const row = Array.isArray(data) ? data[0] : data;
            if (row) setAppt(row);
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [appt?.id, doctor?.id]);

  const cutoffHours = settings?.cancellation_cutoff_hours ?? 2;
  const apptTs = appt ? parseISO(`${appt.date}T${appt.time_slot}`) : null;
  const hoursUntil = apptTs ? differenceInHours(apptTs, new Date()) : 0;
  const tooClose = apptTs && hoursUntil < cutoffHours;
  const isChangeable = appt && (appt.status === "pending" || appt.status === "confirmed") && !tooClose;
  const canReschedule = isChangeable && (appt?.reschedule_count ?? 0) < 2;
  const maxPerSlot = settings?.max_per_slot || 1;
  const advanceDays = settings?.booking_advance_days || 7;
  const days = useMemo(() => Array.from({ length: advanceDays }, (_, i) => addDays(new Date(), i)), [advanceDays]);
  const newDateStr = newDate ? format(newDate, "yyyy-MM-dd") : null;
  const { isFull, bookedIn } = useSlotAvailability(doctor?.id, newDateStr, maxPerSlot);

  const dow = newDate ? newDate.getDay() : -1;
  const wh = workingHours.find((h) => h.day_of_week === dow);
  const timeSlots = wh?.is_open
    ? [...generateTimeSlots(wh.start_time, wh.end_time), ...generateTimeSlots(wh.start_time_2, wh.end_time_2)]
    : [];

  const cancel = async () => {
    if (!appt || !doctor) return;
    if (!confirm("Are you sure you want to cancel this appointment?")) return;
    setBusy(true);
    const { data } = await (supabase as any).rpc("cancel_appointment_by_token", {
      _doctor_id: doctor.id, _token: appt.token_number, _phone: appt.patient_phone,
    });
    setBusy(false);
    if (data?.ok) {
      toast.success("Appointment cancelled.");
      setAppt({ ...appt, status: "cancelled" });
    } else {
      toast.error(errorMessage(data?.error));
    }
  };

  const submitReschedule = async () => {
    if (!appt || !doctor || !newDate || !newTime) return;
    setBusy(true);
    const { data } = await (supabase as any).rpc("reschedule_appointment_by_token", {
      _doctor_id: doctor.id, _token: appt.token_number, _phone: appt.patient_phone,
      _new_date: format(newDate, "yyyy-MM-dd"), _new_time: newTime,
    });
    setBusy(false);
    if (data?.ok) {
      toast.success("Appointment rescheduled.");
      setRescheduling(false); setNewDate(null); setNewTime("");
      lookup();
    } else {
      toast.error(errorMessage(data?.error));
    }
  };

  return (
    <div className="min-h-screen bg-cloud-blue py-10 px-4">
      <div className="container mx-auto max-w-lg">
        {slug && (
          <a href={`/dr/${slug}`} className="inline-flex items-center gap-1 text-sm text-royal mb-4 hover:underline">
            <ChevronLeft className="h-4 w-4" /> Back to Dr. {doctor?.full_name || "Doctor"}
          </a>
        )}

        <Card className="border-border/60 shadow-xl">
          <CardContent className="p-6 md:p-8">
            <h1 className="font-heading font-bold text-2xl text-primary flex items-center gap-2 mb-2">
              <CalendarCheck className="h-6 w-6 text-royal" /> Manage Your Appointment
            </h1>
            <p className="text-sm text-muted-foreground mb-6">
              Enter your token number and phone to view, reschedule or cancel your booking.
            </p>

            {!appt && (
              <form onSubmit={lookup} className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Token Number</Label>
                  <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="e.g. T123" className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone Number</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Registered mobile" className="h-10" />
                </div>
                <Button type="submit" className="w-full h-10 bg-royal hover:bg-royal/90" disabled={loading || !token || !phone}>
                  {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Looking up…</> : "Find My Appointment"}
                </Button>
              </form>
            )}

            {appt && !rescheduling && (
              <div className="space-y-5">
                <div className="bg-secondary rounded-xl p-4 space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-text-gray">Token</span>
                    <span className="font-heading font-bold text-primary">#{appt.token_number}</span>
                  </div>
                  <div className="flex justify-between"><span className="text-text-gray">Patient</span><span className="font-medium">{appt.patient_name}</span></div>
                  <div className="flex justify-between"><span className="text-text-gray">Service</span><span className="font-medium">{appt.service_name}</span></div>
                  <div className="flex justify-between"><span className="text-text-gray">Date</span><span className="font-medium">{format(parseISO(appt.date), "EEE, d MMM yyyy")}</span></div>
                  <div className="flex justify-between"><span className="text-text-gray">Time</span><span className="font-medium">{appt.time_slot}</span></div>
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-text-gray">Status</span>
                    <Badge variant="outline" className={`capitalize ${statusStyle(appt.status)}`}>{appt.status}</Badge>
                  </div>
                  {appt.reschedule_count > 0 && (
                    <div className="flex justify-between text-xs text-warning pt-1">
                      <span>Rescheduled</span><span>{appt.reschedule_count} time{appt.reschedule_count > 1 ? "s" : ""}</span>
                    </div>
                  )}
                </div>

                {(appt.status === "pending" || appt.status === "confirmed") && queuePos !== null && appt.appointment_type === "clinic" && (
                  <div className="p-3 rounded-xl bg-royal/5 border border-royal/20 text-sm text-royal flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <span className="font-semibold">
                      {queuePos === 0 ? "You're next in line!" : `You are #${queuePos + 1} in queue (${queuePos} ahead)`}
                    </span>
                    <span className="ml-auto text-[10px] flex items-center gap-1 opacity-70"><RefreshCw className="h-3 w-3" /> live</span>
                  </div>
                )}

                {tooClose && (appt.status === "pending" || appt.status === "confirmed") && (
                  <div className="p-3 rounded-xl bg-warning/10 border border-warning/20 text-xs text-warning-foreground/80">
                    This appointment is too close to be changed online — please call the clinic.
                  </div>
                )}

                {(appt.status === "pending" || appt.status === "confirmed") && !tooClose && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {canReschedule ? (
                      <Button variant="outline" className="h-10" onClick={() => setRescheduling(true)}>
                        <RefreshCw className="h-4 w-4 mr-1.5" /> Reschedule
                      </Button>
                    ) : (
                      <div className="text-[11px] text-muted-foreground p-2 rounded-lg bg-muted col-span-1">
                        Maximum reschedules reached. Please contact the clinic.
                      </div>
                    )}
                    <Button variant="outline" className="h-10 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={cancel} disabled={busy}>
                      <XCircle className="h-4 w-4 mr-1.5" /> Cancel
                    </Button>
                  </div>
                )}

                <button className="text-xs text-muted-foreground hover:underline" onClick={() => { setAppt(null); setToken(""); setPhone(""); }}>
                  Look up a different appointment
                </button>
              </div>
            )}

            {appt && rescheduling && (
              <div className="space-y-5">
                <button onClick={() => setRescheduling(false)} className="text-sm text-royal hover:underline flex items-center gap-1">
                  <ChevronLeft className="h-4 w-4" /> Back
                </button>

                <div>
                  <h3 className="font-heading font-semibold text-base mb-2">Pick a new date</h3>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {days.map((d, i) => {
                      const dwh = workingHours.find((h) => h.day_of_week === d.getDay());
                      const closed = !dwh?.is_open;
                      const selected = newDate?.toDateString() === d.toDateString();
                      return (
                        <button key={i} disabled={closed} onClick={() => { setNewDate(d); setNewTime(""); }}
                          className={`flex-shrink-0 w-20 py-3 rounded-xl border-2 text-center transition-all ${
                            closed ? "opacity-40 cursor-not-allowed border-border" :
                            selected ? "border-royal bg-royal/5" : "border-border hover:border-royal/50"
                          }`}>
                          <p className="text-xs text-text-gray">{format(d, "EEE")}</p>
                          <p className="font-heading font-bold text-lg">{d.getDate()}</p>
                          <p className="text-xs text-text-gray">{format(d, "MMM")}</p>
                          {closed && <p className="text-[10px] text-destructive mt-1">Closed</p>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {newDate && (
                  <div>
                    <h3 className="font-heading font-semibold text-base mb-2">Pick a new time</h3>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {timeSlots.map((t) => {
                        const full = isFull(t);
                        return (
                          <button key={t} disabled={full} onClick={() => setNewTime(t)}
                            className={`py-3 rounded-lg border-2 text-sm font-medium transition-all ${
                              full ? "border-border bg-muted text-muted-foreground opacity-60 cursor-not-allowed" :
                              newTime === t ? "border-royal bg-royal text-primary-foreground" :
                              "border-border hover:border-royal"
                            }`}>
                            {t}
                            {full ? <span className="block text-[9px] text-destructive font-semibold uppercase">Full</span>
                              : maxPerSlot > 1 ? <span className="block text-[9px] opacity-70">{bookedIn(t)}/{maxPerSlot}</span> : null}
                          </button>
                        );
                      })}
                      {timeSlots.length === 0 && <p className="col-span-full text-sm text-muted-foreground">No slots on this day.</p>}
                    </div>
                  </div>
                )}

                <Button disabled={!newDate || !newTime || busy} onClick={submitReschedule} className="w-full h-11 bg-royal hover:bg-royal/90">
                  {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Rescheduling…</> : <>Confirm New Time <ArrowRight className="h-4 w-4 ml-1.5" /></>}
                </Button>
                <p className="text-[11px] text-muted-foreground text-center">
                  You have {2 - (appt.reschedule_count ?? 0)} reschedule{2 - (appt.reschedule_count ?? 0) === 1 ? "" : "s"} remaining.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const statusStyle = (s: string) => {
  switch (s) {
    case "confirmed": return "bg-success/10 text-success border-success/30";
    case "pending": return "bg-warning/10 text-warning border-warning/30";
    case "completed": return "bg-royal/10 text-royal border-royal/30";
    case "cancelled": return "bg-destructive/10 text-destructive border-destructive/30";
    default: return "";
  }
};

const errorMessage = (code?: string) => {
  switch (code) {
    case "NOT_FOUND": return "Appointment not found.";
    case "NOT_CANCELLABLE": return "This appointment can no longer be cancelled.";
    case "NOT_RESCHEDULABLE": return "This appointment can no longer be rescheduled.";
    case "TOO_CLOSE": return "Too close to the appointment time — please call the clinic.";
    case "MAX_RESCHEDULES": return "You've reached the maximum number of reschedules.";
    case "SLOT_FULL": return "That slot was just taken. Please pick another.";
    default: return "Something went wrong. Please try again.";
  }
};

export default ManageAppointment;
