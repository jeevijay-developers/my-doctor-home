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
import { CalendarCheck, Users, ChevronLeft, XCircle, RefreshCw, Loader2, ArrowRight, BellRing, FileText, Receipt, Download, Eye, MonitorPlay } from "lucide-react";
import { useSlotAvailability } from "@/hooks/useSlotAvailability";
import { generateTimeSlots, DEFAULT_SLOT_DURATION_MINUTES } from "@/lib/timeSlots";
import { clinicToday } from "@/lib/queue";
import VideoConsultationCard from "@/components/VideoConsultationCard";
import AppointmentSlip from "@/components/doctor/AppointmentSlip";
import PaymentSlip from "@/components/doctor/PaymentSlip";
import { downloadPdfFromNode } from "@/lib/downloadPdfFromNode";
import { pdfFileName } from "@/lib/pdfFileName";
import { PUBLIC_PROFILE_COLUMNS } from "@/lib/publicProfileColumns";
import { paymentSummary, queueWaitMinutes, slotTimeLabel } from "@/lib/manageAppointment";
import { hoursFor } from "@/lib/practitioners/hours";
import { slipDoctor } from "@/lib/practitioners/slipDoctor";
import type { PublicPractitioner } from "@/lib/practitioners/types";
import { formatDoctorName } from "@/lib/seo/doctorSeo";
import { useOldSlugRedirect } from "@/hooks/useOldSlugRedirect";

type Appt = {
  id: string; doctor_id: string; patient_name: string; patient_phone: string;
  service_name: string; appointment_type: string; date: string; time_slot: string | null;
  status: string; token_number: string; amount: number; reschedule_count: number;
  chief_complaint: string | null; meeting_link: string | null; created_at: string;
  payment_status?: string | null; payment_method?: string | null; payment_gateway?: string | null;
  gateway_payment_id?: string | null; gateway_order_id?: string | null; paid_at?: string | null;
  /** The doctor the visit is with (multi-doctor clinics); the primary in a single-doctor clinic. */
  practitioner_id?: string | null; practitioner_name?: string | null;
};

const ManageAppointment = () => {
  const { slug } = useParams<{ slug: string }>();
  const redirectOldSlug = useOldSlugRedirect();
  const [params] = useSearchParams();
  const [doctor, setDoctor] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [workingHours, setWorkingHours] = useState<any[]>([]);
  const [practitioners, setPractitioners] = useState<PublicPractitioner[]>([]);
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
  // The clinic could not be loaded: "missing" = no such clinic, "network" = try again.
  const [clinicError, setClinicError] = useState<null | "missing" | "network">(null);
  const [clinicReload, setClinicReload] = useState(0);
  const [queueLive, setQueueLive] = useState(true);
  const [queueInfo, setQueueInfo] = useState<{
    found: boolean; queue_number?: number; state?: string; ahead?: number | null; now_serving?: number | null; avg_minutes?: number | null;
  } | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [newDate, setNewDate] = useState<Date | null>(null);
  const [newTime, setNewTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [slipOpen, setSlipOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);

  useEffect(() => {
    const prevTitle = document.title;
    document.title = doctor?.full_name
      ? `My Appointment · Dr. ${doctor.full_name} | Doctylia`
      : "My Appointment | Doctylia";
    const metaDesc = document.querySelector('meta[name="description"]');
    const prevDesc = metaDesc?.getAttribute("content") ?? null;
    if (metaDesc) {
      metaDesc.setAttribute(
        "content",
        "See your appointment, follow the live queue on the day, download your booking slip or payment receipt, and reschedule or cancel using your token number and mobile number."
      );
    }
    return () => {
      document.title = prevTitle;
      if (metaDesc && prevDesc !== null) metaDesc.setAttribute("content", prevDesc);
    };
  }, [doctor?.full_name]);

  useEffect(() => {
    if (!slug) return;
    setClinicError(null);
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    // One call; supabase-js resolves {error} instead of throwing, so check both.
    const fetchList = async (clinicId: string): Promise<{ list: PublicPractitioner[]; error: unknown }> => {
      try {
        const res = await supabase.rpc("get_public_practitioners", { _doctor_id: clinicId });
        if (res.error) return { list: [], error: res.error };
        return { list: (Array.isArray(res.data) ? res.data : []) as unknown as PublicPractitioner[], error: null };
      } catch (e) {
        return { list: [], error: e };
      }
    };
    (async () => {
      // Explicit public columns (anon cannot read the sensitive ones); the slips use these.
      const { data: profRow, error: profErr } = await supabase.from("profiles").select(PUBLIC_PROFILE_COLUMNS).eq("slug", slug).eq("onboarding_completed", true).single();
      const prof = profRow as unknown as { id: string; full_name: string; clinic_name: string | null; slug: string } | null;
      if (!prof && (!profErr || profErr.code === "PGRST116") && (await redirectOldSlug(slug))) return;
      if (profErr || !prof) {
        // PGRST116 = no row: the clinic does not exist. Anything else is a failed request.
        setClinicError(profErr && profErr.code !== "PGRST116" ? "network" : "missing");
        return;
      }
      setDoctor(prof);
      const [s, wh, pr] = await Promise.all([
        supabase.from("website_settings").select("*").eq("doctor_id", prof.id).single(),
        supabase.from("working_hours").select("*").eq("doctor_id", prof.id).order("day_of_week"),
        // A failed doctor lookup must never break the page: it then works as a single-doctor clinic.
        fetchList(prof.id),
      ]);
      if (cancelled) return;
      // No settings row is fine (defaults apply); a failed request must not silently
      // turn into "every day closed" or the wrong cancellation cutoff.
      if ((s.error && s.error.code !== "PGRST116") || wh.error) {
        setClinicError("network");
        return;
      }
      setSettings(s.data);
      setWorkingHours(wh.data || []);
      setPractitioners(pr.list);
      // One quiet retry after a second; the page already works as a single-doctor clinic meanwhile.
      if (pr.error) {
        retryTimer = setTimeout(async () => {
          const again = await fetchList(prof.id);
          if (cancelled) return;
          if (again.error) console.error("get_public_practitioners failed", again.error);
          else setPractitioners(again.list);
        }, 1000);
      }
    })();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [slug, clinicReload, redirectOldSlug]);

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
      toast.error(
        error.message?.includes("TOO_MANY_ATTEMPTS")
          ? "Too many attempts. Please wait 15 minutes and try again, or call the clinic."
          : "Could not reach the server. Please check your connection and try again.",
      );
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
      _doctor_id: doctor.id, _phone: row.patient_phone, _token: row.token_number,
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
    // The line only exists on the day of the visit; a future booking has nothing to watch.
    if (appt.date !== clinicToday()) return;
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
  // Multi-doctor clinics only: the visit's own doctor decides hours, slot length and slot counts.
  // A single-doctor clinic keeps exactly today's behaviour and requests (no practitioner key).
  const isMulti = practitioners.length >= 2;
  const apptPractitionerId = isMulti ? appt?.practitioner_id ?? null : null;
  const apptPractitioner = apptPractitionerId ? practitioners.find((p) => p.id === apptPractitionerId) ?? null : null;
  // The slip and receipt name the visit's own doctor (is_owner, not is_primary: a non-owner main doctor is still someone else); the owner's row (or no match) keeps the clinic profile as is.
  const slipProfile = useMemo(
    () => (apptPractitioner && !apptPractitioner.is_owner ? slipDoctor(doctor, { ...apptPractitioner, signature_url: null }) : doctor),
    [doctor, apptPractitioner],
  );
  const doctorHours = useMemo(
    () => (apptPractitionerId ? hoursFor(workingHours, apptPractitionerId) : workingHours),
    [workingHours, apptPractitionerId],
  );
  const { isFull } = useSlotAvailability(doctor?.id, newDateStr, (appt?.appointment_type as "clinic" | "online") || "clinic", apptPractitionerId ?? undefined);

  const dow = newDate ? newDate.getDay() : -1;
  const wh = doctorHours.find((h) => h.day_of_week === dow);
  const slotDuration = apptPractitioner?.slot_duration_minutes || settings?.slot_duration_minutes || DEFAULT_SLOT_DURATION_MINUTES;
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

  const apptDate = appt ? parseISO(appt.date) : null;
  const timeLabel = slotTimeLabel(appt?.time_slot);
  const payment = appt ? paymentSummary(appt) : null;
  const hasReceipt = Boolean(appt?.payment_status === "paid" && appt.gateway_payment_id);
  const canShowSlip = Boolean(appt && appt.status !== "cancelled");
  const isClinicVisit = appt?.appointment_type === "clinic";
  const isToday = appt?.date === clinicToday();
  const isOpen = appt ? ["pending", "confirmed"].includes(appt.status) : false;
  const queueHref = slug ? `/dr/${slug}/queue` : null;

  const downloadSlip = () =>
    downloadPdfFromNode("[data-slip-print-root] .slip-card", pdfFileName("Appointment", appt?.patient_name, appt?.date, appt?.token_number));
  const downloadReceipt = () =>
    downloadPdfFromNode("[data-payment-slip-print-root] .slip-card", pdfFileName("Payment-Receipt", appt?.patient_name, appt?.date, appt?.token_number));
  // One tap: open the slip (it renders the document) and save it as a PDF once it has mounted.
  const quickDownload = (which: "slip" | "receipt") => {
    if (which === "slip") {
      setSlipOpen(true);
      setTimeout(downloadSlip, 350);
    } else {
      setReceiptOpen(true);
      setTimeout(downloadReceipt, 350);
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
              <CalendarCheck className="h-6 w-6 text-royal" /> {appt ? "Your Appointment" : "Find Your Appointment"}
            </h1>
            <p className="text-sm text-muted-foreground mb-6">
              {appt
                ? <>With {isMulti && appt.practitioner_name ? formatDoctorName(appt.practitioner_name) : `Dr. ${doctor?.full_name ?? ""}`}{doctor?.clinic_name ? ` · ${doctor.clinic_name}` : ""}</>
                : "Enter the token number from your booking and your mobile number to see your appointment, follow the live queue and download your slips."}
            </p>

            {!appt && (
              <form onSubmit={lookup} className="space-y-4">
                {clinicError && (
                  <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-sm px-3 py-2 flex items-center justify-between gap-2">
                    <span>
                      {clinicError === "missing"
                        ? "We could not find this clinic. Please check the link."
                        : "Could not load the clinic's details. Please check your connection."}
                    </span>
                    {clinicError === "network" && (
                      <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setClinicReload((n) => n + 1)}>Try again</Button>
                    )}
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="manage-token">Token Number</Label>
                  <Input id="manage-token" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="e.g. TK7M2QX9" className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="manage-phone">Phone Number</Label>
                  <Input id="manage-phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Registered mobile" className="h-10" />
                </div>
                <Button type="submit" className="w-full h-10 bg-royal hover:bg-royal/90" disabled={loading || !token || !phone || !!clinicError}>
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
                  {isMulti && appt.practitioner_name && (
                    <div className="flex justify-between"><span className="text-text-gray">Doctor</span><span className="font-medium">{formatDoctorName(appt.practitioner_name)}</span></div>
                  )}
                  <div className="flex justify-between"><span className="text-text-gray">Service</span><span className="font-medium">{appt.service_name}</span></div>
                  <div className="flex justify-between"><span className="text-text-gray">Date</span><span className="font-medium">{format(parseISO(appt.date), "EEE, d MMM yyyy")}</span></div>
                  <div className="flex justify-between"><span className="text-text-gray">Time</span><span className="font-medium">{timeLabel || "Walk-in"}</span></div>
                  {payment && (
                    <div className="flex justify-between gap-3">
                      <span className="text-text-gray">Payment</span>
                      <span className={`font-medium text-right ${payment.tone === "good" ? "text-success" : payment.tone === "warn" ? "text-warning" : ""}`}>{payment.label}</span>
                    </div>
                  )}
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

                {isClinicVisit && isOpen && (
                  <section aria-labelledby="queue-heading" className="rounded-xl border border-royal/20 bg-royal/5 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-royal" aria-hidden="true" />
                      <h2 id="queue-heading" className="font-heading font-semibold text-sm text-royal">Live queue</h2>
                      {isToday && queueInfo?.found && (
                        <span className="ml-auto text-[11px] flex items-center gap-1 text-royal/80">
                          <span className={`h-1.5 w-1.5 rounded-full ${queueLive ? "bg-success animate-pulse" : "bg-warning"}`} aria-hidden="true" />
                          {queueLive ? "Live" : "Reconnecting…"}
                        </span>
                      )}
                    </div>

                    {!isToday ? (
                      <p className="text-sm text-foreground/80">
                        The queue opens on the day of your visit{apptDate ? ` (${format(apptDate, "EEE, d MMM")})` : ""}. Come back to this page then to see how many patients are ahead of you.
                      </p>
                    ) : queueInfo?.found ? (
                      <div role="status" aria-live="polite" className="space-y-3">
                        <p className="font-semibold text-sm text-royal">
                          {queueInfo.state === "serving" && "It's your turn — please go in."}
                          {queueInfo.state === "waiting" && (queueInfo.ahead === 0 ? "You're next in line!" : `${queueInfo.ahead} patient${queueInfo.ahead === 1 ? "" : "s"} ahead of you`)}
                          {queueInfo.state === "skipped" && "You were skipped — please check with the reception."}
                          {queueInfo.state === "done" && "Your visit is complete."}
                          {(queueInfo.state === "cancelled" || queueInfo.state === "no_show") && "This visit is closed."}
                        </p>
                        {(queueInfo.state === "waiting" || queueInfo.state === "serving") && (
                          <dl className="grid grid-cols-3 gap-2 text-center">
                            <div className="rounded-lg bg-background p-2">
                              <dt className="text-[11px] text-muted-foreground">Your number</dt>
                              <dd className="font-heading font-bold text-xl text-primary">#{queueInfo.queue_number}</dd>
                            </div>
                            <div className="rounded-lg bg-background p-2">
                              <dt className="text-[11px] text-muted-foreground">Now serving</dt>
                              <dd className="font-heading font-bold text-xl text-primary">{queueInfo.now_serving != null ? `#${queueInfo.now_serving}` : "—"}</dd>
                            </div>
                            <div className="rounded-lg bg-background p-2">
                              <dt className="text-[11px] text-muted-foreground">Est. wait</dt>
                              <dd className="font-heading font-bold text-xl text-primary">
                                {queueInfo.state === "serving" ? "Now" : (() => {
                                  const mins = queueWaitMinutes(queueInfo);
                                  return mins != null ? `~${mins} min` : "—";
                                })()}
                              </dd>
                            </div>
                          </dl>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-foreground/80">
                        Your queue number appears here once you check in at the reception. This page updates by itself.
                      </p>
                    )}

                    {isToday && queueHref && (
                      <Link to={queueHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-royal hover:underline">
                        <MonitorPlay className="h-4 w-4" aria-hidden="true" /> Open the clinic's queue screen
                      </Link>
                    )}
                  </section>
                )}

                {canShowSlip && (
                  <section aria-labelledby="docs-heading" className="space-y-2">
                    <h2 id="docs-heading" className="font-heading font-semibold text-sm text-foreground">Your documents</h2>
                    <div className="rounded-xl border border-border divide-y divide-border">
                      <div className="flex items-center gap-3 p-3">
                        <FileText className="h-5 w-5 text-royal shrink-0" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">Booking slip</p>
                          <p className="text-xs text-muted-foreground">Token, date, time and clinic details</p>
                        </div>
                        <Button size="sm" variant="ghost" className="h-9" onClick={() => setSlipOpen(true)} aria-label="View booking slip">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" className="h-9" onClick={() => quickDownload("slip")}>
                          <Download className="h-4 w-4 mr-1.5" /> PDF
                        </Button>
                      </div>
                      {hasReceipt && (
                        <div className="flex items-center gap-3 p-3">
                          <Receipt className="h-5 w-5 text-success shrink-0" aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">Payment receipt</p>
                            <p className="text-xs text-muted-foreground">Online payment of ₹{appt.amount}</p>
                          </div>
                          <Button size="sm" variant="ghost" className="h-9" onClick={() => setReceiptOpen(true)} aria-label="View payment receipt">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" className="h-9" onClick={() => quickDownload("receipt")}>
                            <Download className="h-4 w-4 mr-1.5" /> PDF
                          </Button>
                        </div>
                      )}
                    </div>
                  </section>
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

                <button className="text-xs text-muted-foreground hover:underline" onClick={() => { setAppt(null); setQueueInfo(null); setSlipOpen(false); setReceiptOpen(false); setToken(""); setPhone(""); }}>
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
                      const dwh = doctorHours.find((h) => h.day_of_week === d.getDay());
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

      {appt && doctor && (
        <AppointmentSlip
          open={slipOpen}
          onClose={() => setSlipOpen(false)}
          profile={slipProfile}
          settings={settings}
          token={appt.token_number}
          service={{ name: appt.service_name, price: Number(appt.amount) || 0 }}
          type={appt.appointment_type === "online" ? "online" : "clinic"}
          date={apptDate}
          time={timeLabel}
          patientName={appt.patient_name}
          patientPhone={appt.patient_phone}
          paymentStatus={appt.payment_status ?? undefined}
          forceConfirmed={appt.status === "confirmed" || appt.status === "completed"}
          onDownload={downloadSlip}
        />
      )}
      {appt && doctor && hasReceipt && (
        <PaymentSlip
          open={receiptOpen}
          onClose={() => setReceiptOpen(false)}
          profile={slipProfile}
          token={appt.token_number}
          service={{ name: appt.service_name, price: Number(appt.amount) || 0 }}
          type={appt.appointment_type === "online" ? "online" : "clinic"}
          date={apptDate}
          time={timeLabel}
          patientName={appt.patient_name}
          patientPhone={appt.patient_phone}
          amount={Number(appt.amount) || 0}
          razorpayPaymentId={appt.gateway_payment_id ?? ""}
          razorpayOrderId={appt.gateway_order_id ?? ""}
          paidAt={appt.paid_at ?? appt.created_at}
          onDownload={downloadReceipt}
        />
      )}
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
    case "TOO_MANY_ATTEMPTS": return "Too many attempts. Please wait 15 minutes and try again, or call the clinic.";
    case "MAX_RESCHEDULES": return "You've reached the maximum number of reschedules.";
    case "SLOT_FULL": return "That slot was just taken. Please pick another.";
    case "SLOT_IN_PAST": return "That time is in the past - please pick a future slot.";
    default: return "Something went wrong. Please try again.";
  }
};

export default ManageAppointment;
