import { useEffect, useMemo, useState } from "react";
import { normalizeBookingToken } from "@/lib/bookingToken";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format, addDays, differenceInHours, parseISO, isSameDay } from "date-fns";
import { CalendarCheck, Clock, Users, ChevronLeft, XCircle, RefreshCw, Loader2, ArrowRight, BellRing } from "lucide-react";
import { useSlotAvailability } from "@/hooks/useSlotAvailability";
import { generateTimeSlots, DEFAULT_SLOT_DURATION_MINUTES } from "@/lib/timeSlots";
import VideoConsultationCard from "@/components/VideoConsultationCard";

type Appt = {
  id: string; doctor_id: string; patient_name: string; patient_phone: string;
  service_name: string; appointment_type: string; date: string; time_slot: string | null;
  status: string; token_number: string; amount: number; reschedule_count: number;
  chief_complaint: string | null; meeting_link: string | null; created_at: string;
};

const ManageAppointment = () => {
  const { slug } = useParams<{ slug: string }>();
  const [params] = useSearchParams();
  const [doctor, setDoctor] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [workingHours, setWorkingHours] = useState<any[]>([]);
  // Links carry the token and phone in the URL fragment (#), which never reaches servers
  // or Referer headers; older links used the query string, which is still accepted.
  const hashParams = useMemo(() => new URLSearchParams(window.location.hash.replace(/^#/, "")), []);
  const [token, setToken] = useState(hashParams.get("token") || params.get("token") || "");
  const [phone, setPhone] = useState(hashParams.get("phone") || params.get("phone") || "");
  // Once read, take them out of the address bar and the browser history entry.
  useEffect(() => {
    if (window.location.hash || params.get("token") || params.get("phone")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [loading, setLoading] = useState(false);
  const [appt, setAppt] = useState<Appt | null>(null);
  const [upcomingCheckup, setUpcomingCheckup] = useState<{ doctor_name: string; next_checkup_date: string; reminder_enabled: boolean } | null>(null);
  const [queueLive, setQueueLive] = useState(true);
  const [queueInfo, setQueueInfo] = useState<{
    found: boolean; queue_number?: number; state?: string; ahead?: number | null; now_serving?: number | null; avg_minutes?: number | null;
  } | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [newDate, setNewDate] = useState<Date | null>(null);
  const [newTime, setNewTime] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const prevTitle = document.title;
    document.title = doctor?.full_name
      ? `Manage Appointment · Dr. ${doctor.full_name} | Doctylia`
      : "Manage Your Appointment | Doctylia";
    const metaDesc = document.querySelector('meta[name="description"]');
    const prevDesc = metaDesc?.getAttribute("content") ?? null;
    if (metaDesc) {
      metaDesc.setAttribute(
        "content",
        "Look up, reschedule, or cancel your booked clinic or online consultation appointment using your token number and registered mobile number."
      );
    }
    return () => {
      document.title = prevTitle;
      if (metaDesc && prevDesc !== null) metaDesc.setAttribute("content", prevDesc);
    };
  }, [doctor?.full_name]);

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
    const { data, error } = await (supabase as any).rpc("get_appointment_by_token", {
      _doctor_id: doctor.id, _token: normalizeBookingToken(token), _phone: phone.trim(),
    });
    setLoading(false);
    if (error) {
      // A network or server failure is not "no such appointment".
      toast.error("Could not reach the server. Please check your connection and try again.");
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      toast.error("No appointment found with that token and phone number.");
      setAppt(null);
      return;
    }
    setAppt(row as Appt);
    const { data: checkupData } = await (supabase as any).rpc("get_upcoming_checkup", {
      _doctor_id: doctor.id, _phone: row.patient_phone,
    });
    const checkupRow = Array.isArray(checkupData) ? checkupData[0] : checkupData;
    setUpcomingCheckup(checkupRow || null);
  };

  // Auto-lookup if URL has token+phone
  useEffect(() => {
    if (doctor && token && phone && !appt) lookup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctor]);

  // Live place in line. Visitors have no read access to appointments, so realtime never
  // reaches them; they poll one narrow function that returns numbers only.
  useEffect(() => {
    if (!appt || !doctor || appt.appointment_type !== "clinic") return;
    // A closed booking has no line to watch.
    if (["cancelled", "completed", "no_show"].includes(appt.status)) return;
    let cancelled = false;
    let inFlight = false;
    const refresh = async () => {
      // No point polling from a hidden tab or while the last request is still running.
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const [queueRes, freshRes] = await Promise.all([
          (supabase as any).rpc("get_my_queue_status", {
            _doctor_id: doctor.id, _token: appt.token_number, _phone: appt.patient_phone,
          }),
          // Also refresh the appointment itself to catch status/date changes.
          (supabase as any).rpc("get_appointment_by_token", {
            _doctor_id: doctor.id, _token: appt.token_number, _phone: appt.patient_phone,
          }),
        ]);
        if (cancelled) return;
        if (!queueRes.error && queueRes.data) setQueueInfo(queueRes.data);
        const row = Array.isArray(freshRes.data) ? freshRes.data[0] : freshRes.data;
        if (!freshRes.error && row) {
          // Compare against the latest state, not the one captured when the effect ran.
          setAppt((prev) => (prev && (prev.status !== row.status || prev.date !== row.date || prev.time_slot !== row.time_slot) ? row : prev));
        }
        setQueueLive(!queueRes.error && !freshRes.error);
      } finally {
        inFlight = false;
      }
    };
    refresh();
    const timer = setInterval(refresh, 10000);
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { cancelled = true; clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appt?.id, appt?.status, doctor?.id]);

  const cutoffHours = settings?.cancellation_cutoff_hours ?? 2;
  const apptTs = appt?.time_slot ? parseISO(`${appt.date}T${appt.time_slot}`) : null;
  const hoursUntil = apptTs ? differenceInHours(apptTs, new Date()) : 0;
  const tooClose = apptTs && hoursUntil < cutoffHours;
  const isChangeable = appt && (appt.status === "pending" || appt.status === "confirmed") && !tooClose;
  const canReschedule = isChangeable && (appt?.reschedule_count ?? 0) < 2;
  const advanceDays = settings?.booking_advance_days || 7;
  const days = useMemo(() => Array.from({ length: advanceDays }, (_, i) => addDays(new Date(), i)), [advanceDays]);
  const newDateStr = newDate ? format(newDate, "yyyy-MM-dd") : null;
  const { isFull } = useSlotAvailability(doctor?.id, newDateStr, (appt?.appointment_type as "clinic" | "online") || "clinic");

  const dow = newDate ? newDate.getDay() : -1;
  const wh = workingHours.find((h) => h.day_of_week === dow);
  const slotDuration = settings?.slot_duration_minutes || DEFAULT_SLOT_DURATION_MINUTES;
  const rawSlots = wh?.is_open
    ? [...generateTimeSlots(wh.start_time, wh.end_time, slotDuration), ...generateTimeSlots(wh.start_time_2, wh.end_time_2, slotDuration)]
    : [];
  const timeSlots = newDate && isSameDay(newDate, new Date())
    ? rawSlots.filter((t) => {
        const [h, m] = t.split(":").map(Number);
        const slot = new Date(); slot.setHours(h, m, 0, 0);
        return slot.getTime() > Date.now();
      })
    : rawSlots;

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
    <div className="min-h-screen bg-cloud-blue py-10 px-4 overflow-x-hidden">
      <div className="container mx-auto max-w-lg">
        {slug && (
          <Link to={`/dr/${slug}`} className="inline-flex items-center gap-1 text-sm text-royal mb-4 hover:underline">
            <ChevronLeft className="h-4 w-4" /> Back to Dr. {doctor?.full_name || "Doctor"}
          </Link>
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
                  <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="e.g. TK7M2QX9" className="h-10" />
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
                  <div className="flex justify-between"><span className="text-text-gray">Time</span><span className="font-medium">{appt.time_slot || "Walk-in"}</span></div>
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

                {upcomingCheckup && (
                  <div className="rounded-xl border border-royal/20 bg-royal/5 p-4 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-royal uppercase tracking-wide">
                      <BellRing className="h-3.5 w-3.5" /> Upcoming Checkup
                    </div>
                    <p className="text-sm text-foreground">
                      Dr. {upcomingCheckup.doctor_name} <br />
                      Regular Health Checkup <br />
                      <span className="font-heading font-bold text-primary">
                        {format(parseISO(upcomingCheckup.next_checkup_date), "d MMMM yyyy")}
                      </span>
                    </p>
                    {upcomingCheckup.reminder_enabled && (
                      <p className="text-[11px] text-success font-medium">Reminder enabled</p>
                    )}
                    {slug && (
                      <Link to={`/dr/${slug}#booking`}>
                        <Button size="sm" className="h-8 text-xs bg-royal hover:bg-royal/90">Book Appointment</Button>
                      </Link>
                    )}
                  </div>
                )}

                {queueInfo?.found && appt.appointment_type === "clinic" && (
                  <div role="status" aria-live="polite" className="p-3 rounded-xl bg-royal/5 border border-royal/20 text-sm text-royal space-y-1">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      <span className="font-semibold">
                        {queueInfo.state === "serving" && "It's your turn — please go in."}
                        {queueInfo.state === "waiting" && (queueInfo.ahead === 0 ? "You're next in line!" : `${queueInfo.ahead} patient${queueInfo.ahead === 1 ? "" : "s"} ahead of you`)}
                        {queueInfo.state === "skipped" && "You were skipped — please check with the reception."}
                        {queueInfo.state === "done" && "Your visit is complete."}
                        {(queueInfo.state === "cancelled" || queueInfo.state === "no_show") && "This visit is closed."}
                      </span>
                      <span className="ml-auto text-[10px] flex items-center gap-1 opacity-70"><RefreshCw className="h-3 w-3" /> {queueLive ? "live" : "reconnecting…"}</span>
                    </div>
                    {(queueInfo.state === "waiting" || queueInfo.state === "serving") && (
                      <div className="text-xs text-royal/80">
                        Your number: <strong>#{queueInfo.queue_number}</strong>
                        {queueInfo.now_serving != null && <> · Now serving: <strong>#{queueInfo.now_serving}</strong></>}
                        {queueInfo.state === "waiting" && queueInfo.avg_minutes != null && queueInfo.ahead != null && (
                          <> · about {Math.max(1, Math.round((queueInfo.ahead + (queueInfo.now_serving != null ? 0.5 : 0)) * queueInfo.avg_minutes))} min</>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {appt.appointment_type === "online" && (appt.status === "pending" || appt.status === "confirmed") && (
                  <VideoConsultationCard
                    appointmentId={appt.id}
                    date={appt.date}
                    timeSlot={appt.time_slot}
                    role="patient"
                    status={appt.status}
                    hasMeeting={!!appt.meeting_link}
                    patientToken={appt.token_number}
                    patientPhone={appt.patient_phone}
                  />
                )}

                {tooClose && (appt.status === "pending" || appt.status === "confirmed") && (
                  <div className="p-3 rounded-xl bg-warning/10 border border-warning/20 text-xs text-warning-foreground/80">
                    This appointment is too close to be changed online - please call the clinic.
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

                <button className="text-xs text-muted-foreground hover:underline" onClick={() => { setAppt(null); setQueueInfo(null); setToken(""); setPhone(""); }}>
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
                              : null}
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
    case "TOO_CLOSE": return "Too close to the appointment time - please call the clinic.";
    case "MAX_RESCHEDULES": return "You've reached the maximum number of reschedules.";
    case "SLOT_FULL": return "That slot was just taken. Please pick another.";
    case "SLOT_IN_PAST": return "That time is in the past - please pick a future slot.";
    default: return "Something went wrong. Please try again.";
  }
};

export default ManageAppointment;
