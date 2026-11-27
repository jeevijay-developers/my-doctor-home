import { useState, useMemo, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, XCircle, ChevronLeft, ChevronDown, Video, Users, Clock, FileText, Building2, Receipt, AlertCircle, CalendarPlus } from "lucide-react";

import { useDoctorData } from "@/contexts/DoctorContext";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays, isSameDay } from "date-fns";
import { toast } from "sonner";
import { useSlotAvailability } from "@/hooks/useSlotAvailability";
import { useNearViewport } from "@/hooks/useNearViewport";
import { isValidIndianPhone, normalizeIndianPhone, phoneErrorMessage } from "@/lib/phone";
import { edgeFunctionErrorMessage } from "@/lib/edgeFunctionError";
import { generateBookingToken } from "@/lib/bookingToken";
import { downloadPdfFromNode } from "@/lib/downloadPdfFromNode";
import { pdfFileName } from "@/lib/pdfFileName";
import { FEATURE_KEYS } from "@/lib/features";
import { usePaymentMode } from "@/hooks/usePaymentMode";
import TestModeBadge from "@/components/shared/TestModeBadge";
import { loadRazorpayCheckout } from "@/lib/razorpayCheckout";
import AppointmentSlip from "./AppointmentSlip";
import PaymentSlip from "./PaymentSlip";
import MockCheckoutModal from "./MockCheckoutModal";
import { generateTimeSlots, DEFAULT_SLOT_DURATION_MINUTES } from "@/lib/timeSlots";
import { SELECT_SLOT_EVENT, slotLabel, type SelectSlotDetail } from "@/lib/doctorSite/nextAvailable";
import { buildAppointmentIcs, downloadIcs } from "@/lib/doctorSite/ics";
import { dsScrollTo } from "./motion/scroll";
import DsButton from "./ui/DsButton";
import DatePicker from "./booking/DatePicker";
import TimePicker from "./booking/TimePicker";
import BookingStepper from "./booking/BookingStepper";
import BookingAside from "./booking/BookingAside";
import { radioKeyDown } from "./ui/radioKeyDown";
import SectionHeader from "./ui/SectionHeader";
import { DUR, EASE } from "./motion/tokens";
import DoctorPicker from "./DoctorPicker";
import { practitionerFee } from "@/lib/practitioners/fee";
import { SELECT_DOCTOR_EVENT } from "./DoctorsSection";
import { hoursFor } from "@/lib/practitioners/hours";
import { practitionerErrorMessage } from "@/lib/practitioners/errors";
import { formatDoctorName } from "@/lib/seo/doctorSeo";

const getNextDays = (count: number) => {
  const days = [];
  const today = new Date();
  for (let i = 0; i < count; i++) days.push(addDays(today, i));
  return days;
};

/** Marks a required field's label (the input itself is also `required`). */
const Req = () => (
  <span aria-hidden="true" className="ml-0.5 text-ds-danger">
    *
  </span>
);

const SummaryRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-4 text-ds-small">
    <span className="text-ds-ink-3">{label}</span>
    <span className="break-words text-right font-medium text-ds-ink">{value || "-"}</span>
  </div>
);

type PaymentMeta = {
  razorpayPaymentId: string;
  razorpayOrderId: string;
  amount: number;
  paidAt: string | null;
};

// A Razorpay order + our internal payments row id, cached across a failed/
// cancelled Checkout attempt so "Retry Payment" reopens the SAME order
// instead of minting a new one each time - one payments row per booking
// attempt, never a duplicate appointment.
type CachedOrder = {
  payment_id: string;
  order_id: string;
  key_id: string;
  amount: number;
  currency: string;
  mode: "mock" | "live";
  /** Fingerprint of the booking details this order was created for (see bookingKey). */
  key: string;
};

type CheckoutResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };

const STEP_LABELS = ["When", "Your details", "Review & pay"];
// Multi-doctor clinics put a "Doctor" step (internal step 0) in front.
const MULTI_STEP_LABELS = ["Doctor", ...STEP_LABELS];

const BookingWidget = () => {
  const { profile, services, settings, workingHours, allWorkingHours, bookablePractitioners, soleBookable, refreshPractitioners, isMultiDoctor, isPremium, hasFeature, servicePractitioners } = useDoctorData();
  const { isMock: paymentModeIsMock } = usePaymentMode();
  const [step, setStep] = useState(isMultiDoctor ? 0 : 1);
  // Multi-doctor clinics only: the doctor being booked. A single-doctor clinic never sets it,
  // so its requests stay exactly as before (the database fills practitioner_id).
  const [practitionerId, setPractitionerId] = useState<string | null>(null);
  // Doctors a booking was refused for: the picker stops offering them (the list is reloaded meanwhile).
  const [rejectedIds, setRejectedIds] = useState<string[]>([]);
  // A clinic with two or more doctors where only one takes online bookings has no picker: that doctor is the one.
  const doctors = useMemo(
    () => (isMultiDoctor ? bookablePractitioners ?? [] : soleBookable ? [soleBookable] : []).filter((d) => !rejectedIds.includes(d.id)),
    [isMultiDoctor, bookablePractitioners, soleBookable, rejectedIds],
  );
  const sel = isMultiDoctor ? doctors.find((d) => d.id === practitionerId) ?? null : doctors[0] ?? null;
  const needsDoctor = isMultiDoctor && !sel;
  // Services limited to some doctors (multi / sole-bookable clinics only; a single-doctor clinic is untouched).
  // A service with no mapping rows is offered by everyone. With a doctor chosen it must be offered by that
  // doctor; a service whose mapped doctors are all unavailable for booking is hidden for everyone.
  const serviceOffered = (serviceId: string | null | undefined, doctorId: string | null | undefined) => {
    if (!serviceId || !(isMultiDoctor || soleBookable)) return true;
    const mapped = (servicePractitioners ?? []).filter((m) => m.service_id === serviceId);
    if (mapped.length === 0) return true;
    if (!mapped.some((m) => doctors.some((d) => d.id === m.practitioner_id))) return false;
    return !doctorId || mapped.some((m) => m.practitioner_id === doctorId);
  };
  const serviceOfferedRef = useRef(serviceOffered);
  serviceOfferedRef.current = serviceOffered;
  // The hours slots are made from: the chosen doctor's own, else the clinic's.
  const bookingHours = useMemo(
    () => (sel ? hoursFor(allWorkingHours ?? [], sel.id) : workingHours),
    [sel, allWorkingHours, workingHours],
  );
  const [type, setType] = useState<"clinic" | "online">("clinic");
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  // Set when a service picked on the page is not offered by the chosen doctor; clears on doctor change.
  const [serviceHint, setServiceHint] = useState<{ name: string; doctorId: string | null } | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [complaint, setComplaint] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmedPaymentStatus, setConfirmedPaymentStatus] = useState<"paid" | "pay_at_clinic">("pay_at_clinic");
  const [paymentMeta, setPaymentMeta] = useState<PaymentMeta | null>(null);
  const [cachedOrder, setCachedOrder] = useState<CachedOrder | null>(null);
  const [paymentFailed, setPaymentFailed] = useState(false);
  // Why the last "Pay Now" could not start (e.g. the clinic's online payments are not active).
  const [payError, setPayError] = useState("");
  const [paymentFailureMessage, setPaymentFailureMessage] = useState("");
  // Razorpay took the payment but confirming it with our server failed: the patient may
  // already have been charged, so they must not pay again.
  const [unconfirmed, setUnconfirmed] = useState<{ order: CachedOrder; response: CheckoutResponse } | null>(null);
  // The clinic refused the booking after the patient paid: the money is held for a refund, so no retry.
  const [refundPending, setRefundPending] = useState<{ paymentId: string } | null>(null);
  const [token, setToken] = useState("");
  const [patientsAhead, setPatientsAhead] = useState<number | null>(null);
  const [confirmedApptId, setConfirmedApptId] = useState<string | null>(null);
  const [slipOpen, setSlipOpen] = useState(false);
  const [paymentSlipOpen, setPaymentSlipOpen] = useState(false);
  const [mockCheckoutOpen, setMockCheckoutOpen] = useState(false);
  // True while the async slot re-validation fires on time-slot selection
  const [checkingSlot, setCheckingSlot] = useState(false);


  // Any time the patient steps back before Review (to change date,
  // time, or their own details), the previously cached Razorpay order no
  // longer matches what would be booked - drop it so the next "Pay Now"
  // creates a fresh order instead of silently booking stale details.
  useEffect(() => { if (step < 5) setCachedOrder(null); }, [step]);

  // Nothing past the Doctor step without a doctor (e.g. a service picked first, or the doctor left the list).
  useEffect(() => { if (needsDoctor && step > 0) setStep(0); }, [needsDoctor, step]);

  const advanceDays = settings?.booking_advance_days || 7;
  const days = useMemo(() => getNextDays(advanceDays), [advanceDays]);

  const dayOfWeek = selectedDate ? selectedDate.getDay() : -1;
  const wh = bookingHours.find((h) => h.day_of_week === dayOfWeek);
  const slotDuration = sel?.slot_duration_minutes || settings?.slot_duration_minutes || DEFAULT_SLOT_DURATION_MINUTES;

  const rawTimeSlots = wh?.is_open
    ? [...generateTimeSlots(wh.start_time, wh.end_time, slotDuration), ...generateTimeSlots(wh.start_time_2, wh.end_time_2, slotDuration)]
    : [];
  // Hide time slots that are already in the past for today
  const timeSlots = selectedDate && isSameDay(selectedDate, new Date())
    ? rawTimeSlots.filter((t) => {
        const [h, m] = t.split(":").map(Number);
        const slot = new Date(); slot.setHours(h, m, 0, 0);
        return slot.getTime() > Date.now();
      })
    : rawTimeSlots;

  const consultationTypes = [
    { k: "clinic" as const, label: "Clinic Visit", Icon: Building2 },
    ...(hasFeature(FEATURE_KEYS.ONLINE_CONSULTATION) ? [{ k: "online" as const, label: "Online", Icon: Video }] : []),
  ];

  // Listen for service selections dispatched from ServicesSection
  useEffect(() => {
    const handleSelectService = (event: Event) => {
      const customEvent = event as CustomEvent<any>;
      const svc = customEvent.detail;
      if (!svc) return;
      // A doctor-limited service the chosen doctor does not offer is not selected; say why, near the service picker.
      if (svc.id && !serviceOfferedRef.current(svc.id, live.current.practitionerId)) {
        setServiceHint({ name: String(svc.name ?? "That service"), doctorId: live.current.practitionerId ?? null });
        return;
      }
      setServiceHint(null);
      // Never rewrite a booking that is being paid for or whose payment failed (the retry must
      // match what the patient saw); after a confirmation, start a fresh booking instead.
      if (live.current.submitting || live.current.paymentFailed) return;
      if (live.current.confirmed) live.current.reset();
      if (svc.type === "online" && hasFeature(FEATURE_KEYS.ONLINE_CONSULTATION)) {
        setType("online");
      } else if (svc.type === "clinic") {
        setType("clinic");
      }
      setSelectedServiceId(svc.id ?? null);
      setCachedOrder(null);
      setStep(2);
    };
    window.addEventListener("doctylia:select-service", handleSelectService as EventListener);
    return () => window.removeEventListener("doctylia:select-service", handleSelectService as EventListener);
  }, [hasFeature]);

  // Multi-doctor: a different doctor means different hours and slots, so the date and time start
  // over, and any payment order made for the previous doctor is dropped. Patient details are kept.
  const chooseDoctor = (id: string) => {
    if (id === live.current.practitionerId) return;
    live.current.practitionerId = id;
    setPayError("");
    setPractitionerId(id);
    if (selectedServiceId && !serviceOffered(selectedServiceId, id)) setSelectedServiceId(null);
    setServiceHint(null);
    setSelectedDate(null);
    setSelectedTime("");
    setCachedOrder(null);
  };

  // The list was reloaded and no longer needs a choice (one or no bookable doctor left): go on to When.
  useEffect(() => {
    if (!isMultiDoctor && step === 0) setStep(1);
  }, [isMultiDoctor, step]);

  // "Book" on a doctor's card (DoctorsSection): preselect that doctor and open When.
  useEffect(() => {
    if (!isMultiDoctor && !soleBookable) return;
    const handleSelectDoctor = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string } | undefined>).detail?.id;
      if (!id || !doctors.some((d) => d.id === id)) return;
      if (live.current.submitting || live.current.paymentFailed) return;
      if (live.current.confirmed) live.current.reset();
      chooseDoctor(id);
      setStep(1);
    };
    window.addEventListener(SELECT_DOCTOR_EVENT, handleSelectDoctor as EventListener);
    return () => window.removeEventListener(SELECT_DOCTOR_EVENT, handleSelectDoctor as EventListener);
    // chooseDoctor only touches state setters and the live ref.
  }, [isMultiDoctor, soleBookable, doctors]);

  const [phoneTouched, setPhoneTouched] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const stepRegionRef = useRef<HTMLDivElement>(null);
  // Latest values for code that runs outside React's render (window events, async results).
  const live = useRef({
    confirmed: false, paymentFailed: false, submitting: false, bookingKey: "", dateStr: null as string | null, reset: () => {},
    practitionerId: null as string | null, needsDoctor: false,
  });
  // The time currently shown in the time field. It only becomes the booking's time (selectedTime)
  // when the patient taps Continue and the slot passes the live availability re-check.
  const [pickedTime, setPickedTime] = useState("");
  const [zoneRef, zoneNear] = useNearViewport<HTMLElement>("400px");

  // Open on the first day that still has a bookable time, so the patient sees
  // slots straight away instead of choosing a date first. Held back until the
  // booking area is near the screen (this starts live availability polling).
  useEffect(() => {
    if (selectedDate || step > 3 || !zoneNear || needsDoctor) return;
    const firstBookable = days.find((d) => {
      const row = bookingHours.find((h) => h.day_of_week === d.getDay());
      if (!row?.is_open) return false;
      const all = [
        ...generateTimeSlots(row.start_time, row.end_time, slotDuration),
        ...generateTimeSlots(row.start_time_2, row.end_time_2, slotDuration),
      ];
      return isSameDay(d, new Date())
        ? all.some((t) => {
            const [h, m] = t.split(":").map(Number);
            const slot = new Date();
            slot.setHours(h, m, 0, 0);
            return slot.getTime() > Date.now();
          })
        : all.length > 0;
    });
    if (firstBookable) setSelectedDate(firstBookable);
  }, [selectedDate, step, zoneNear, days, bookingHours, slotDuration, needsDoctor]);

  // The chosen doctor's own fee (when set) replaces the clinic's, as public_booking_price does.
  const consultFee = sel ? practitionerFee(sel, profile?.consultation_fee) : (profile?.consultation_fee ?? 500);
  const defaultFee = type === "online"
    ? (settings?.online_fee || consultFee)
    : consultFee;

  const defaultServiceOption = useMemo(() => ({
    id: null as string | null,
    name: type === "online" ? "Online Consultation" : "Clinic Visit",
    price: Number(defaultFee),
    duration: type === "online" ? Number(settings?.online_duration || 30) : Number(settings?.slot_duration_minutes || 15),
    type,
  }), [type, defaultFee, settings?.online_duration, settings?.slot_duration_minutes]);

  const compatibleServices = useMemo(() => {
    const activeServices = (services || []).filter(
      (s: any) => s && s.active !== false && (s.type === type || s.type === "both") && serviceOffered(s.id, sel?.id)
    );
    return [
      defaultServiceOption,
      ...activeServices.map((s: any) => ({
        id: s.id as string,
        name: s.name?.trim() || "Consultation",
        price: Number(s.price && Number(s.price) > 0 ? s.price : defaultFee),
        duration: Number(s.duration || 30),
        type: s.type as string,
      })),
    ];
    // serviceOffered is derived from exactly these inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services, type, defaultServiceOption, defaultFee, servicePractitioners, doctors, sel?.id, isMultiDoctor, soleBookable]);

  // The chosen service stopped being offered (doctor list reloaded, doctor rejected): fall back to the default option.
  useEffect(() => {
    if (selectedServiceId && !serviceOffered(selectedServiceId, sel?.id)) setSelectedServiceId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedServiceId, servicePractitioners, doctors, sel?.id]);

  const selectedService = useMemo(() => {
    if (selectedServiceId) {
      const found = compatibleServices.find((s) => s.id === selectedServiceId);
      if (found) return found;
    }
    return defaultServiceOption;
  }, [selectedServiceId, compatibleServices, defaultServiceOption]);

  const dateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;
  const { counts, isFull, refresh } = useSlotAvailability(profile?.id, dateStr, type, sel?.id);
  // Free slots only: already-booked times (live counts) and past times are not offered at all.
  const availableTimeSlots = timeSlots.filter((time) => (counts[time] || 0) < 1).sort();
  const availableKey = availableTimeSlots.join(",");

  // Keep the time field on a real free slot: the committed time when coming back, else what the
  // patient had, else the earliest free one (so if the shown time gets booked, it moves on, and the
  // Continue button always names the time that will be booked).
  // A time the widget chose by itself only carries over within the same day (e.g. when the live
  // list refreshes); on another day it resets to that day's earliest free time. A time the patient
  // picked themselves is kept on the new day when it is free there.
  const shownBefore = useRef("");
  const shownDay = useRef("");
  const patientPicked = useRef(false);
  const pickTime = (time: string) => {
    patientPicked.current = true;
    shownBefore.current = time;
    setPickedTime(time);
  };
  useEffect(() => {
    if (!selectedDate) {
      shownBefore.current = "";
      shownDay.current = "";
      setPickedTime("");
      return;
    }
    const day = format(selectedDate, "yyyy-MM-dd");
    const slots = availableKey ? availableKey.split(",") : [];
    const carry = shownBefore.current && (day === shownDay.current || patientPicked.current);
    let next = "";
    if (selectedTime && slots.includes(selectedTime)) next = selectedTime;
    else if (carry && slots.includes(shownBefore.current)) next = shownBefore.current;
    else next = slots[0] ?? "";
    shownBefore.current = next;
    shownDay.current = day;
    setPickedTime(next);
  }, [availableKey, selectedDate, selectedTime]);

  const wantsOnlinePayment = Boolean(settings?.require_payment);
  // The widget keeps its internal steps (1-3 pick a date and time, 4 details, 5 review),
  // but the patient sees one "When" screen, then details, then (online payment) review.
  // A multi-doctor clinic shows "Doctor" first, so every later step moves up by one.
  const stepOffset = isMultiDoctor ? 1 : 0;
  const visibleStep = step === 0 ? 1 : (step <= 3 ? 1 : step === 4 ? 2 : 3) + stepOffset;
  const totalSteps = (wantsOnlinePayment ? 3 : 2) + stepOffset;
  const stepLabels = isMultiDoctor ? MULTI_STEP_LABELS : STEP_LABELS;
  // The doctor named on the review, confirmation, slips, calendar file and checkout.
  const doctorLabel = sel ? formatDoctorName(sel.display_name) : `Dr. ${profile?.full_name ?? ""}`;
  // Slips and the aside read the doctor from a profile-shaped object (they add "Dr." themselves).
  const doctorProfile = useMemo(() => {
    if (!isMultiDoctor && !sel) return profile;
    const bare = sel ? formatDoctorName(sel.display_name).replace(/^Dr\.\s*/, "") : "";
    return {
      ...profile,
      display_name: bare,
      full_name: bare,
      specialization: sel?.specialization ?? null,
      qualifications: sel?.qualifications ?? null,
      registration_number: sel?.registration_number ?? null,
      profile_photo_url: sel?.photo_url ?? null,
    };
  }, [isMultiDoctor, profile, sel]);

  // A booking the database or payment function refused because of the doctor: forget that doctor,
  // stop offering them, tell the patient, and reload the list so the widget re-evaluates.
  const handleDoctorRefusal = (raw: string): string | null => {
    const refused = /PRACTITIONER_NOT_BOOKABLE|SEAT_LIMIT|PRACTITIONER_REQUIRED|PRACTITIONER_MISMATCH/.test(raw);
    const mapped = practitionerErrorMessage(raw);
    if (!mapped) return null;
    if (/(?<![A-Z0-9_])(INVALID_SERVICE|SERVICE_NOT_OFFERED)(?![A-Z0-9_])/.test(raw)) {
      // The service is not offered by this doctor (stale page or changed mapping): drop it and reload the mappings.
      setSelectedServiceId(null);
      setCachedOrder(null);
      void refreshPractitioners?.();
      return mapped;
    }
    if (!refused) return mapped;
    const hadDoctor = sel?.id ?? null;
    if (hadDoctor) setRejectedIds((ids) => (ids.includes(hadDoctor) ? ids : [...ids, hadDoctor]));
    setPractitionerId(null);
    live.current.practitionerId = null;
    setSelectedDate(null);
    setSelectedTime("");
    setCachedOrder(null);
    if (isMultiDoctor) setStep(0); // let the patient choose another doctor
    void refreshPractitioners?.();
    // No doctor was ever chosen (the list failed to load, or the page is stale): only a reload helps.
    return !hadDoctor && /PRACTITIONER_REQUIRED|PRACTITIONER_NOT_BOOKABLE/.test(raw)
      ? "Please reload the page to choose your doctor."
      : mapped;
  };

  const validatePatientDetails = () => {
    if (!name || !phone || !age || !gender || !complaint.trim()) return false;
    if (!isValidIndianPhone(phone)) { toast.error(phoneErrorMessage); return false; }
    if (Number(age) < 0 || Number(age) > 120) { toast.error("Please enter a valid age (0–120)."); return false; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error("Enter a valid email or leave it blank."); return false; }
    return true;
  };

  // Pay at Clinic booking - appointment is created immediately (unchanged
  // behaviour). Only used when the doctor has NOT turned on Require Online
  // Payment; the online-payment path below never calls this.
  const createAppointmentRow = async (): Promise<{ id: string; token: string } | null> => {
    if (!profile || !selectedDate || !selectedTime) return null;
    if (!validatePatientDetails()) return null;
    const normalizedPhone = normalizeIndianPhone(phone);
    const tkn = generateBookingToken();
    const dStr = format(selectedDate, "yyyy-MM-dd");

    // Anonymous visitors have no SELECT policy on appointments, so the row must not be
    // read back (.select() would fail the whole insert). Generate the id client-side.
    const apptId = crypto.randomUUID();
    const { error } = await supabase
      .from("appointments")
      // sort_time is stamped by a BEFORE INSERT trigger; the generated type marks it required.
      .insert({
        id: apptId,
        doctor_id: profile.id,
        patient_name: name,
        patient_phone: normalizedPhone,
        patient_age: age ? Number(age) : null,
        patient_gender: gender || null,
        patient_email: email || null,
        service_name: selectedService.name,
        appointment_type: type,
        date: dStr,
        time_slot: selectedTime,
        amount: selectedService.price,
        token_number: tkn,
        chief_complaint: complaint || null,
        status: "pending" as any,
        payment_status: "pay_at_clinic" as any,
        // Only multi-doctor clinics name the doctor; otherwise the database fills it.
        ...(sel ? { practitioner_id: sel.id } : {}),
      } as never);

    if (error) {
      if (error.message?.includes("SLOT_FULL")) {
        toast.error("Sorry, this slot was just booked by someone else. Please choose another time.");
        setStep(3);
        setSelectedTime("");
        refresh();
        return null;
      }
      if (error.message?.includes("SLOT_IN_PAST")) {
        toast.error("That time has already passed - please pick a later slot.");
        setStep(3); setSelectedTime(""); refresh();
        return null;
      }
      if (error.message?.includes("TOO_MANY_BOOKINGS")) {
        toast.error("You already have 3 upcoming bookings with this clinic. Please attend or cancel one first.");
        return null;
      }
      if (error.message?.includes("PHONE_REQUIRED")) {
        toast.error("Please enter a valid 10-digit mobile number.");
        return null;
      }
      const doctorProblem = handleDoctorRefusal(error.message ?? "");
      if (doctorProblem) {
        toast.error(doctorProblem);
        return null;
      }
      toast.error("Booking failed. Please try again.");
      return null;
    }

    return { id: apptId, token: tkn };
  };

  const finalizeConfirmed = (id: string, tkn: string, paymentStatus: "paid" | "pay_at_clinic") => {
    setConfirmedApptId(id);
    setToken(tkn);
    setConfirmedPaymentStatus(paymentStatus);
    setConfirmed(true);
  };

  // Queue position is fetched separately (not part of finalizeConfirmed) so it
  // can run for both the pay-at-clinic and pay-online paths without forcing
  // every caller to await it before showing the confirmation screen.
  useEffect(() => {
    if (!confirmed || type !== "clinic" || !confirmedApptId) return;
    (supabase as any).rpc("get_queue_position", { _appointment_id: confirmedApptId })
      .then(({ data: qp, error: qErr }: { data: unknown; error: unknown }) =>
        // A failed lookup must hide the line, not claim "you are first".
        setPatientsAhead(!qErr && typeof qp === "number" ? qp : null))
      .catch(() => setPatientsAhead(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmed, confirmedApptId]);

  const submitBooking = async () => {
    if (submitting) return;
    setSubmitting(true);
    // A public booking never creates a patient record: the clinic's system does that when
    // the patient is called in or the visit completes.
    try {
      const created = await createAppointmentRow();
      if (created) finalizeConfirmed(created.id, created.token, "pay_at_clinic");
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setStep(isMultiDoctor ? 0 : 1); setPractitionerId(null); live.current.practitionerId = null; setType("clinic"); setSelectedServiceId(null); setSelectedDate(null);
    setSelectedTime(""); setName(""); setPhone(""); setEmail(""); setAge(""); setGender(""); setComplaint("");
    setConfirmed(false); setConfirmedPaymentStatus("pay_at_clinic"); setPaymentMeta(null);
    setCachedOrder(null); setPaymentFailed(false); setPaymentFailureMessage(""); setUnconfirmed(null); setRefundPending(null); setMockCheckoutOpen(false);
    setToken(""); setPatientsAhead(null); setConfirmedApptId(null); setServiceOpen(false);
  };

  // Everything that makes up the booking. A cached payment order is only reusable while this is unchanged.
  const bookingKey = JSON.stringify([type, selectedService?.id ?? null, dateStr, selectedTime, name.trim(), phone, age, gender, email, complaint, sel?.id ?? null]);
  live.current = { confirmed, paymentFailed, submitting, bookingKey, dateStr, reset, practitionerId, needsDoctor };

  const downloadSlip = () => downloadPdfFromNode('[data-slip-print-root] .slip-card', pdfFileName("Appointment", name, selectedDate ? format(selectedDate, "yyyy-MM-dd") : null, token));
  const downloadPaymentSlip = () => downloadPdfFromNode('[data-payment-slip-print-root] .slip-card', pdfFileName("Payment-Receipt", name, selectedDate ? format(selectedDate, "yyyy-MM-dd") : null, token));

  // "Download Appointment/Payment Slip" on the confirmation screen open the
  // (printable) slip dialog and immediately trigger the PDF download once its
  // content has mounted - one click, automatically generated, no second step.
  const handleDownloadAppointmentSlip = () => {
    setSlipOpen(true);
    setTimeout(downloadSlip, 350);
  };
  const handleDownloadPaymentSlip = () => {
    setPaymentSlipOpen(true);
    setTimeout(downloadPaymentSlip, 350);
  };

  // Called when the patient taps a time-slot on step 4. We do an instant
  // isFull() check against the live cached counts first, then fire a fresh
  // refresh() to pull the very latest state from the DB before advancing -
  // this catches any booking that completed in the last 8 s polling window.
  //
  // IMPORTANT: after await refresh(), we use the freshCounts map returned
  // directly from the call rather than calling isFull() again - isFull() reads
  // the React `counts` state which is updated asynchronously and would still
  // hold the stale value at the point we check it (classic stale-closure bug).
  const selectTimeSlot = async (slot: string) => {
    if (checkingSlot) return;

    // Instant guard from live cached counts.
    if (isFull(slot)) {
      toast.error("Sorry, this slot was just booked by someone else. Please choose another time.");
      refresh();
      return;
    }

    // Fire a fresh DB query to catch bookings that happened between polls.
    setCheckingSlot(true);
    const freshCounts = await refresh();
    setCheckingSlot(false);

    // Re-check against the freshly returned map - NOT isFull() (stale closure).
    if ((freshCounts[slot] || 0) >= 1) {
      toast.error("Sorry, this slot was just booked by someone else. Please choose another time.");
      return;
    }

    // Slot still available - advance the wizard.
    setSelectedTime(slot);
    setStep(4);
  };

  // Quick-book from the hero ("Book this slot"): select that date, then validate
  // the slot against a fresh availability read for THAT date (never the counts
  // still cached for the date the patient was browsing). A nonce makes repeat taps
  // on the same date work. If the slot was taken meanwhile the patient lands on
  // the time picker with the usual explanation.
  const [quickPick, setQuickPick] = useState<{ dateKey: string; time: string; nonce: number } | null>(null);
  useEffect(() => {
    const handleSelectSlot = (event: Event) => {
      const detail = (event as CustomEvent<SelectSlotDetail>).detail;
      if (!detail?.dateKey || !detail.time) return;
      // A slot means nothing before a doctor is chosen (the hero offers none to multi-doctor clinics).
      if (live.current.needsDoctor) return;
      if (live.current.submitting || live.current.paymentFailed) return;
      if (live.current.confirmed) live.current.reset();
      const [y, m, d] = detail.dateKey.split("-").map(Number);
      setType(detail.type === "online" && hasFeature(FEATURE_KEYS.ONLINE_CONSULTATION) ? "online" : "clinic");
      setSelectedServiceId(null);
      setCachedOrder(null);
      setSelectedDate(new Date(y, m - 1, d));
      setSelectedTime("");
      setStep(3);
      setQuickPick({ dateKey: detail.dateKey, time: detail.time, nonce: Date.now() });
    };
    window.addEventListener(SELECT_SLOT_EVENT, handleSelectSlot as EventListener);
    return () => window.removeEventListener(SELECT_SLOT_EVENT, handleSelectSlot as EventListener);
  }, [hasFeature]);

  const handledQuickPick = useRef(0);
  useEffect(() => {
    if (!quickPick || quickPick.dateKey !== dateStr || handledQuickPick.current === quickPick.nonce) return;
    const { time, nonce } = quickPick;
    handledQuickPick.current = nonce;
    setSelectedTime(time);
    setCheckingSlot(true);
    refresh()
      .then((freshCounts) => {
        if (handledQuickPick.current !== nonce) return; // a newer tap took over
        if (live.current.dateStr !== quickPick.dateKey) return; // the patient moved to another date meanwhile
        if ((freshCounts[time] || 0) >= 1) {
          setSelectedTime("");
          toast.error("Sorry, this slot was just booked by someone else. Please choose another time.");
          return;
        }
        setStep(4);
      })
      .catch(() => {
        if (handledQuickPick.current === nonce) setSelectedTime("");
      })
      .finally(() => {
        if (handledQuickPick.current === nonce) setCheckingSlot(false);
      });
  }, [quickPick, dateStr, refresh]);

  // Step 4 "Continue" for online-payment doctors - just moves to the Review
  // Booking Summary step. Nothing is written to the database here.
  // Also re-validates the slot so a race between step 3 selection and step 4
  // Continue is caught before the patient proceeds to payment.
  const proceedToReview = () => {
    if (!validatePatientDetails()) return;
    // Defense-in-depth: re-check from cached counts before advancing.
    if (selectedTime && isFull(selectedTime)) {
      toast.error("Sorry, this slot was just booked by someone else. Please choose another time.");
      setStep(3);
      setSelectedTime("");
      refresh();
      return;
    }
    setStep(5);
  };

  // Opens a Razorpay order for the current booking details (or reuses one
  // already cached for this Review session) - no appointment or DB row for
  // the appointment itself is created here, only a `payments` row holding
  // the pending booking payload.
  const ensureOrder = async (): Promise<CachedOrder | null> => {
    if (cachedOrder && cachedOrder.key === bookingKey) return cachedOrder;
    const keyAtStart = bookingKey;
    if (!profile || !selectedDate || !selectedTime) return null;
    if (isFull(selectedTime)) {
      toast.error("Sorry, this slot was just booked by someone else. Please choose another time.");
      setStep(3); setSelectedTime(""); refresh();
      return null;
    }

    const dStr = format(selectedDate, "yyyy-MM-dd");
    const bookingPayload = {
      doctor_id: profile.id,
      service_id: selectedService.id ?? null,
      patient_name: name,
      patient_phone: normalizeIndianPhone(phone),
      patient_age: age ? Number(age) : null,
      patient_gender: gender || null,
      patient_email: email || null,
      service_name: selectedService.name,
      appointment_type: type,
      date: dStr,
      time_slot: selectedTime,
      amount: selectedService.price,
      chief_complaint: complaint || null,
      ...(sel ? { practitioner_id: sel.id } : {}),
    };

    const { data: orderData, error: orderErr } = await supabase.functions.invoke("create-razorpay-order", {
      body: bookingPayload,
    });

    if (orderErr || !orderData?.order_id) {
      const message = await edgeFunctionErrorMessage(orderErr, "Online payment isn't available right now.");
      let refusalText: string | null = null;
      if (message.includes("SLOT_FULL")) {
        toast.error("Sorry, this slot was just booked by someone else. Please choose another time.");
        setStep(3); setSelectedTime(""); refresh();
      } else if (message.includes("SLOT_IN_PAST")) {
        toast.error("That time has already passed - please pick a later slot.");
        setStep(3); setSelectedTime(""); refresh();
      } else if ((refusalText = handleDoctorRefusal(message)) !== null) {
        const text = refusalText;
        setPayError(text);
        toast.error("Booking not completed", { description: text });
      } else {
        const notActive = /not (set up|active|configured)/i.test(message);
        const text = notActive
          ? "Online payment isn't active for this clinic yet, so this booking could not be completed. Please call the clinic to book, or try again later."
          : "We couldn't start the payment, so this booking was not completed. Please try again in a moment.";
        setPayError(text);
        toast.error("Booking not completed", { description: text });
      }
      return null;
    }

    if (live.current.bookingKey !== keyAtStart) {
      // The patient changed something while the order was being prepared: that order is for the old details.
      toast.error("Your details changed while we were preparing the payment. Please review and try again.");
      return null;
    }

    const order: CachedOrder = {
      key: keyAtStart,
      payment_id: orderData.payment_id,
      order_id: orderData.order_id,
      key_id: orderData.key_id,
      amount: orderData.amount,
      currency: orderData.currency,
      mode: orderData.mode === "mock" ? "mock" : "live",
    };
    setCachedOrder(order);
    return order;
  };

  // Shared by the real Razorpay `handler` callback AND MockCheckoutModal's
  // "Simulate Successful Payment" / "Simulate Signature Mismatch" - every
  // outcome from either gateway is verified through this exact same call,
  // so verify-razorpay-payment, appointment creation, and commission split
  // run identically in mock and live mode. Only the caller (real Checkout vs
  // the mock modal) differs.
  const handleCheckoutResult = async (order: CachedOrder, response: CheckoutResponse) => {
    const { data: verifyData, error: verifyErr } = await supabase.functions.invoke("verify-razorpay-payment", {
      body: {
        payment_id: order.payment_id,
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature,
      },
    });

    if (verifyErr || !verifyData?.ok || !verifyData?.appointment) {
      const fallback = "Payment verification failed. Please contact the clinic with your payment ID.";
      // The refusal details can arrive in an error response body or in a plain response.
      let body: { error?: unknown; message?: unknown; refund_pending?: unknown; payment_id?: unknown } | null = verifyData ?? null;
      let message = fallback;
      const ctx = (verifyErr as { context?: Response } | null)?.context;
      if (ctx && typeof ctx.json === "function") {
        try {
          body = await ctx.json();
          message = String(body?.message || body?.error || fallback);
        } catch {
          // keep the fallback
        }
      } else if (!verifyErr && body?.error) {
        message = String(body.message || body.error);
      }
      setMockCheckoutOpen(false);
      setPaymentFailureMessage(message);
      setRefundPending(
        body?.refund_pending === true
          ? { paymentId: String(body.payment_id || response.razorpay_payment_id) }
          : null,
      );
      setUnconfirmed({ order, response });
      setPaymentFailed(true);
      setSubmitting(false);
      return; // The payment may have gone through; see the "unconfirmed" screen.
    }
    setUnconfirmed(null);
    setRefundPending(null);

    setPaymentMeta({
      razorpayPaymentId: response.razorpay_payment_id,
      razorpayOrderId: response.razorpay_order_id,
      amount: Number(verifyData.payment?.amount ?? selectedService?.price ?? order.amount / 100),
      paidAt: verifyData.appointment.created_at ?? null,
    });
    setCachedOrder(null);
    setMockCheckoutOpen(false);
    toast.success(order.mode === "mock" ? "Test payment successful! Your appointment is confirmed." : "Payment successful! Your appointment is confirmed.");
    finalizeConfirmed(verifyData.appointment.id, verifyData.appointment.token_number, "paid");
    setSubmitting(false);
  };

  // Shared by real Razorpay's `payment.failed` event and MockCheckoutModal's
  // "Simulate Failed Payment" / "Payment Timeout" - a genuine failure (as
  // opposed to the patient just closing the modal) sends them to the
  // dedicated Payment Failed screen.
  const handleCheckoutFailure = (message: string) => {
    setUnconfirmed(null);
    setMockCheckoutOpen(false);
    setPaymentFailureMessage(message);
    setPaymentFailed(true);
    setSubmitting(false);
  };

  // Cancelled, not failed - keep the cached order so a follow-up "Pay Now"
  // click on the Review step reuses it instead of minting a new one.
  const handleCheckoutDismiss = () => {
    setSubmitting(false);
    setMockCheckoutOpen(false);
    toast.info("Payment cancelled.", { description: "No appointment was created. You can try again anytime." });
  };

  // Opens Checkout for an already-created order and verifies the result. The
  // appointment is created ONLY inside verify-razorpay-payment, and only
  // after the payment signature is verified - so a failed/cancelled payment
  // never books anything, and a successful one can never be applied twice
  // (idempotent on payment_id). In mock mode this opens MockCheckoutModal
  // instead of loading the real Razorpay script - everything past this point
  // (verification, appointment creation, ledger) is identical either way.
  const openCheckout = async (order: CachedOrder) => {
    if (order.mode === "mock") {
      setMockCheckoutOpen(true);
      return;
    }

    try {
      await loadRazorpayCheckout();
    } catch {
      toast.error("Couldn't load the payment gateway. Please try again.");
      setSubmitting(false);
      return;
    }

    const rzp = new (window as any).Razorpay({
      key: order.key_id,
      amount: order.amount,
      currency: order.currency,
      order_id: order.order_id,
      name: sel ? doctorLabel : profile?.clinic_name || (profile?.full_name ? `Dr. ${profile.full_name}` : "Doctylia"),
      description: selectedService?.name,
      prefill: { name, contact: normalizeIndianPhone(phone), email: email || undefined },
      theme: { color: "#3C83FC" },
      handler: (response: CheckoutResponse) => handleCheckoutResult(order, response),
      modal: { ondismiss: handleCheckoutDismiss },
    });
    rzp.on("payment.failed", (resp: { error?: { description?: string } }) => {
      handleCheckoutFailure(resp?.error?.description || "Your payment could not be completed. Please try again.");
    });
    rzp.open();
  };

  // Review Summary "Pay Now" AND the Payment Failed screen's "Retry Payment"
  // both call this - retry reuses the cached order (same payments row) so a
  // second attempt never creates a second appointment record.
  const payNow = async () => {
    setPayError("");
    if (submitting) return;
    if (!validatePatientDetails()) return;
    setSubmitting(true);
    const order = await ensureOrder();
    if (!order) { setSubmitting(false); return; }
    await openCheckout(order);
  };

  // Bring the patient to the result (and announce it) when a booking is confirmed or payment fails.
  useEffect(() => {
    if (confirmed || paymentFailed) dsScrollTo("booking", { focusSelector: "#booking-heading" });
  }, [confirmed, paymentFailed]);

  // Moving between steps unmounts the focused control; park focus on the step region instead of <body>.
  // (The details step focuses its first field itself.)
  const lastVisibleStep = useRef(visibleStep);
  useEffect(() => {
    if (lastVisibleStep.current === visibleStep) return;
    lastVisibleStep.current = visibleStep;
    // Bring the new step's top into view (the previous step may have left the page scrolled to its bottom).
    // The details step focuses its first field itself, which scroll's focus handling leaves alone.
    dsScrollTo("booking-card");
  }, [visibleStep]);

  const estWaitMinutes = (patientsAhead ?? 0) * (selectedService?.duration || 15);

  const dayLabel = selectedDate ? format(selectedDate, "EEE, d MMM") : "";
  const serviceDuration = Number(selectedService?.duration) || slotDuration;

  // "Add to calendar": a .ics generated in the browser from the confirmed booking.
  const addToCalendar = () => {
    if (!selectedDate || !selectedTime) return;
    const clinic = profile?.clinic_name || (profile?.full_name ? `Dr. ${profile.full_name}` : "Clinic");
    const where = [profile?.clinic_name, profile?.address, profile?.city].filter(Boolean).join(", ");
    const ics = buildAppointmentIcs({
      uid: token || crypto.randomUUID(),
      title: `${selectedService?.name || "Appointment"} · ${clinic}`,
      date: selectedDate,
      time: selectedTime,
      durationMinutes: serviceDuration,
      status: confirmedPaymentStatus === "paid" || settings?.auto_confirm ? "CONFIRMED" : "TENTATIVE",
      location: type === "online" ? "Online consultation" : where,
      description: [`Booking ID: ${token}`, `Patient: ${name}`, sel ? `Doctor: ${doctorLabel}` : profile?.full_name ? `Doctor: Dr. ${profile.full_name}` : ""].filter(Boolean).join("\n"),
    });
    downloadIcs(`Appointment-${token || "visit"}`, ics);
  };

  const sectionShell = (children: React.ReactNode, narrow = true) => (
    <section id="booking" aria-labelledby="booking-heading" ref={zoneRef} className="bg-ds-paper py-[4.5rem] md:py-32">
      <div className={`mx-auto px-5 sm:px-6 lg:px-8 ${narrow ? "max-w-[44rem]" : "max-w-[1200px]"}`}>{children}</div>
    </section>
  );

  const resultCard = "rounded-ds-lg border border-ds-line bg-ds-surface p-6 shadow-ds-2 sm:p-9";

  if (confirmed) {
    const paid = confirmedPaymentStatus === "paid";
    const details: [string, string][] = [
      ["Doctor", doctorLabel],
      ["When", `${selectedDate ? format(selectedDate, "EEEE, d MMMM") : ""} · ${selectedTime ? slotLabel(selectedTime) : ""}`],
      ["Visit", `${type === "clinic" ? "Clinic visit" : "Online consultation"} · ${selectedService?.name ?? ""}`],
      ["Patient", name],
      [paid ? "Amount paid" : "Amount", `₹${paid ? (paymentMeta?.amount ?? selectedService?.price ?? 0) : (selectedService?.price ?? 0)}`],
    ];
    return sectionShell(
      <>
        <div className={resultCard} role="status" aria-live="polite">
          <motion.svg
            viewBox="0 0 52 52"
            className="h-14 w-14 text-ds-live"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <motion.circle cx="26" cy="26" r="23" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6, ease: EASE.out }} />
            <motion.path d="M15 27l8 8 14-16" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, delay: 0.35, ease: EASE.out }} />
          </motion.svg>
          <h2 id="booking-heading" tabIndex={-1} className="mt-5 font-ds-display text-ds-h2 font-medium outline-none">
            {paid ? "Booking Successful!" : `Appointment ${settings?.auto_confirm ? "Confirmed" : "Requested"}!`}
          </h2>
          <p className="mt-2 text-ds-body text-ds-ink-2">
            Your booking ID is <strong className="font-semibold text-ds-ink ds-tabular">{token}</strong>. Keep it to manage your appointment.
          </p>

          <dl className="mt-7 border-t border-ds-line">
            {details.map(([term, detail]) => (
              <div key={term} className="grid gap-1 border-b border-ds-line py-3.5 sm:grid-cols-[8rem_1fr] sm:gap-4">
                <dt className="text-ds-label font-medium uppercase tracking-[0.08em] text-ds-ink-3">{term}</dt>
                <dd className="text-ds-body text-ds-ink">{detail}</dd>
              </div>
            ))}
          </dl>

          {paid && (
            <p className="mt-5 flex items-center gap-2 rounded-ds-sm bg-ds-live/[0.08] px-4 py-3 text-ds-small font-medium text-ds-live">
              <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0" />
              Payment received. You're all paid up for this appointment.
            </p>
          )}

          {type === "clinic" && patientsAhead !== null && (
            <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-ds-sm bg-ds-accent-soft px-4 py-3 text-ds-small font-medium text-ds-accent-ink">
              <Users aria-hidden="true" className="h-4 w-4 shrink-0" />
              {patientsAhead === 0 ? "You're first in line. No wait!" : `${patientsAhead} patient${patientsAhead > 1 ? "s" : ""} ahead of you`}
              {patientsAhead > 0 && (
                <span className="inline-flex items-center gap-1 font-normal">
                  <Clock aria-hidden="true" className="h-3.5 w-3.5" /> about {estWaitMinutes} min
                </span>
              )}
            </p>
          )}

          {type === "online" && (
            <p className="mt-4 flex items-start gap-2 rounded-ds-sm bg-ds-accent-soft px-4 py-3 text-ds-small text-ds-accent-ink">
              <Video aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              Your video consultation link will be shared with you 1 hour before your appointment.
            </p>
          )}

          <div className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
            <DsButton size="lg" onClick={addToCalendar} className="w-full sm:w-auto">
              <CalendarPlus aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.75} />
              Add to calendar
            </DsButton>
            <DsButton size="lg" variant="secondary" onClick={handleDownloadAppointmentSlip} className="w-full sm:w-auto">
              <FileText aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.75} />
              Download Appointment Slip
            </DsButton>
            {paid && (
              <DsButton size="lg" variant="secondary" onClick={handleDownloadPaymentSlip} className="w-full sm:w-auto">
                <Receipt aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.75} />
                Download Payment Slip
              </DsButton>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-ds-line pt-5 text-ds-small">
            {profile?.slug && (
              <a
                // The fragment (after #) is never sent to servers or in Referer headers, unlike a query string.
                href={`/dr/${profile.slug}/manage#token=${encodeURIComponent(token)}&phone=${encodeURIComponent(phone)}`}
                className="inline-flex min-h-11 items-center font-medium text-ds-accent-ink underline-offset-4 hover:underline"
              >
                Manage this appointment (cancel or reschedule) →
              </a>
            )}
            <button type="button" onClick={reset} className="inline-flex min-h-11 items-center font-medium text-ds-ink-2 underline-offset-4 hover:text-ds-ink hover:underline">
              Book Another
            </button>
          </div>
        </div>

        <AppointmentSlip
          open={slipOpen}
          onClose={() => setSlipOpen(false)}
          profile={doctorProfile}
          settings={settings}
          token={token}
          service={selectedService}
          type={type}
          date={selectedDate}
          time={selectedTime}
          patientName={name}
          patientPhone={phone}
          paymentStatus={confirmedPaymentStatus}
          forceConfirmed={paid ? true : undefined}
          onDownload={downloadSlip}
        />

        {paid && paymentMeta && (
          <PaymentSlip
            open={paymentSlipOpen}
            onClose={() => setPaymentSlipOpen(false)}
            profile={doctorProfile}
            token={token}
            service={selectedService}
            type={type}
            date={selectedDate}
            time={selectedTime}
            patientName={name}
            patientPhone={phone}
            amount={paymentMeta.amount}
            razorpayPaymentId={paymentMeta.razorpayPaymentId}
            razorpayOrderId={paymentMeta.razorpayOrderId}
            paidAt={paymentMeta.paidAt}
            onDownload={downloadPaymentSlip}
          />
        )}
      </>,
    );
  }

  // Payment genuinely failed (Razorpay's payment.failed event) or our own
  // verification rejected it - as opposed to the patient simply closing the
  // Checkout modal, which just returns them to Review Summary with a toast.
  // No appointment exists yet either way; Retry Payment reuses the same
  // cached order so retrying never creates a duplicate.
  if (paymentFailed) {
    return sectionShell(
      <>
        <div className={resultCard} role="alert">
          <XCircle aria-hidden="true" className="h-12 w-12 text-ds-danger" strokeWidth={1.5} />
          <h2 id="booking-heading" tabIndex={-1} className="mt-5 flex flex-wrap items-center gap-3 font-ds-display text-ds-h2 font-medium outline-none">
            Payment Failed {paymentModeIsMock && <TestModeBadge />}
          </h2>
          <p className="mt-2 text-ds-body text-ds-ink-2">{paymentFailureMessage || "Your payment could not be completed."}</p>

          <dl className="mt-6 border-t border-ds-line text-ds-small">
            {[
              ["Doctor", doctorLabel],
              ["Visit", `${type === "clinic" ? "Clinic visit" : "Online consultation"} · ${selectedService?.name ?? ""}`],
              ["When", `${selectedDate ? format(selectedDate, "EEEE, d MMMM") : ""} · ${selectedTime ? slotLabel(selectedTime) : ""}`],
              ["Amount", `₹${selectedService?.price ?? 0}`],
            ].map(([term, detail]) => (
              <div key={term} className="flex justify-between gap-4 border-b border-ds-line py-3">
                <dt className="text-ds-ink-3">{term}</dt>
                <dd className="text-right text-ds-ink">{detail}</dd>
              </div>
            ))}
          </dl>

          {unconfirmed && refundPending ? (
            <>
              <p className="mt-6 text-ds-body font-semibold">
                Payment received but your booking could not be confirmed. Reference: {refundPending.paymentId}. The clinic will contact you to refund or rebook — please do not pay again.
              </p>
            </>
          ) : unconfirmed ? (
            <>
              <p className="mt-6 text-ds-body font-semibold">Your payment may have gone through. Please do NOT pay again.</p>
              <p className="mt-1 text-ds-small text-ds-ink-2">
                Payment ID: {unconfirmed.response.razorpay_payment_id}. Tap "Check payment status" to confirm it, or contact the clinic with this ID.
              </p>
              <div className="mt-6">
                <DsButton
                  size="lg"
                  disabled={submitting}
                  onClick={() => {
                    setPaymentFailed(false);
                    setSubmitting(true);
                    handleCheckoutResult(unconfirmed.order, unconfirmed.response);
                  }}
                >
                  {submitting ? "Checking..." : "Check payment status"}
                </DsButton>
              </div>
            </>
          ) : (
            <>
              <p className="mt-6 text-ds-small text-ds-ink-2">No appointment was created and you were not charged. You can safely retry.</p>
              <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
                <DsButton size="lg" disabled={submitting} onClick={() => { setPaymentFailed(false); payNow(); }}>
                  {submitting ? "Retrying..." : "Retry Payment"}
                </DsButton>
                <DsButton size="lg" variant="secondary" onClick={() => { setPaymentFailed(false); setCachedOrder(null); setStep(4); }}>
                  Edit Booking Details
                </DsButton>
              </div>
            </>
          )}
        </div>

        {cachedOrder?.mode === "mock" && (
          <MockCheckoutModal
            open={mockCheckoutOpen}
            paymentId={cachedOrder.payment_id}
            amount={selectedService?.price ?? 0}
            doctorName={doctorLabel}
            serviceName={selectedService?.name}
            dateLabel={selectedDate ? format(selectedDate, "d MMM yyyy") : undefined}
            timeLabel={selectedTime}
            onResult={(response) => handleCheckoutResult(cachedOrder, response)}
            onFailed={handleCheckoutFailure}
            onDismiss={handleCheckoutDismiss}
          />
        )}
      </>,
    );
  }

  // ------------------------------------------------------------------ steps

  const stepHeader = () => (
    <div className="mb-8">
      <BookingStepper labels={stepLabels.slice(0, totalSteps)} current={visibleStep} />
      {step >= 4 && (
        <button
          type="button"
          disabled={submitting}
          onClick={() => { setPayError(""); setStep(step === 5 ? 4 : 3); }}
          className="-ml-3 mt-5 inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-ds-small font-medium text-ds-ink-2 transition-colors hover:bg-ds-ink/[0.06] hover:text-ds-ink"
        >
          <ChevronLeft aria-hidden="true" className="h-4 w-4" /> Back
        </button>
      )}
    </div>
  );

  const chipBase =
    "flex min-h-12 items-center justify-between gap-3 rounded-ds-sm border px-4 py-2.5 text-left transition-colors duration-ds-1 ";
  const chipOn = "border-ds-accent bg-ds-accent-soft text-ds-ink ring-1 ring-ds-accent";
  const chipOff = "border-ds-line bg-ds-surface text-ds-ink hover:border-ds-ink/30";

  // Multi-doctor step 0: choose the doctor; Continue waits for a choice.
  const renderDoctor = () => (
    <div className="space-y-6">
      <h3 className="font-ds-display text-ds-h3 font-medium">Choose your doctor</h3>
      {doctors.length === 0 && (
        <p className="rounded-ds-md border border-dashed border-ds-line px-4 py-6 text-center text-ds-small text-ds-ink-2">
          No doctors are taking online bookings right now. Please contact the clinic.
        </p>
      )}
      <DoctorPicker doctors={doctors} value={sel?.id ?? null} onChange={chooseDoctor} clinicFee={profile?.consultation_fee} />
      <DsButton size="lg" className="w-full" disabled={!sel} onClick={() => setStep(1)}>
        Continue
      </DsButton>
    </div>
  );

  // The chosen doctor has no open day among the days patients can book.
  const noOpenDays = !!sel && !days.some((d) => bookingHours.find((h) => h.day_of_week === d.getDay())?.is_open);

  const renderWhen = () => (
    <div className="space-y-9">
      {sel && (
        <div className="flex items-center justify-between gap-4 rounded-ds-md border border-ds-line bg-ds-paper-2 px-4 py-2">
          <p className="min-w-0 text-ds-small">
            <span className="text-ds-label uppercase tracking-[0.08em] text-ds-ink-3">Doctor</span>
            <span className="block truncate text-ds-body font-semibold text-ds-ink">{doctorLabel}</span>
          </p>
          {isMultiDoctor && (
            <button
              type="button"
              onClick={() => setStep(0)}
              className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-ds-small font-medium text-ds-accent-ink underline-offset-4 hover:underline"
            >
              Change<span className="sr-only"> doctor</span>
            </button>
          )}
        </div>
      )}

      {noOpenDays && (
        <div className="space-y-4 rounded-ds-md border border-dashed border-ds-line px-4 py-6 text-center">
          <p className="text-ds-body text-ds-ink-2">{doctorLabel} has no online hours right now.</p>
          {isMultiDoctor && (
            <DsButton size="lg" variant="secondary" onClick={() => setStep(0)}>
              Choose another doctor
            </DsButton>
          )}
        </div>
      )}

      {!noOpenDays && consultationTypes.length > 1 && (
        <div role="radiogroup" aria-label="Consultation type" onKeyDown={radioKeyDown} className="grid grid-cols-2 gap-3">
          {consultationTypes.map((t) => (
            <button
              key={t.k}
              type="button"
              role="radio"
              tabIndex={type === t.k ? 0 : -1}
              aria-checked={type === t.k}
              onClick={() => { setType(t.k); setSelectedServiceId(null); setSelectedTime(""); setCachedOrder(null); }}
              className={`flex min-h-[4.5rem] items-center gap-3 rounded-ds-md border p-3 text-left transition-[border-color,box-shadow,background-color] duration-ds-1 sm:p-4 ${type === t.k ? "border-ds-accent bg-ds-accent-soft/60 shadow-[0_0_0_3px_rgb(var(--ds-accent)/0.12)]" : "border-ds-line bg-ds-surface hover:border-ds-ink/30"}`}
            >
              <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${type === t.k ? "bg-ds-accent text-white" : "bg-ds-paper-2 text-ds-ink-2"}`}>
                <t.Icon className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <span className="min-w-0">
                <span className="block text-ds-small font-semibold text-ds-ink">{t.label}</span>
                <span className="block text-ds-label text-ds-ink-2">{t.k === "clinic" ? "At the clinic" : "Video call"}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {!noOpenDays && serviceHint && serviceHint.doctorId === (sel?.id ?? null) && (
        <p role="status" className="rounded-ds-md border border-ds-line bg-ds-paper-2 px-4 py-2 text-ds-small text-ds-ink-2">
          {serviceHint.name} isn't offered by {doctorLabel}. Choose another doctor to book it.
        </p>
      )}

      {!noOpenDays && compatibleServices.length > 1 && (
        // Most patients want the default: show it as one line and tuck the alternatives away,
        // so the dates and times (the actual decision) stay near the top of the card.
        <div>
          <div className="flex items-center justify-between gap-4 rounded-ds-md border border-ds-line bg-ds-paper-2 px-4 py-2">
            <p className="min-w-0 text-ds-small">
              <span className="text-ds-label uppercase tracking-[0.08em] text-ds-ink-3">Service</span>
              <span className="block truncate font-semibold text-ds-ink">{selectedService.name} · ₹{selectedService.price}</span>
            </p>
            <button
              type="button"
              aria-expanded={serviceOpen}
              onClick={() => setServiceOpen((open) => !open)}
              className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-ds-small font-medium text-ds-accent-ink underline-offset-4 hover:underline"
            >
              {serviceOpen ? "Done" : "Change"}<span className="sr-only"> service</span>
            </button>
          </div>
          {serviceOpen && (
        <fieldset className="mt-3">
          <legend className="mb-3 text-ds-label font-medium uppercase tracking-[0.08em] text-ds-ink-3">Service</legend>
          <div role="radiogroup" aria-label="Service" onKeyDown={radioKeyDown} className="grid gap-2 sm:grid-cols-2">
            {compatibleServices.map((svc) => {
              const on = (selectedService.id ?? null) === (svc.id ?? null);
              return (
                <button
                  key={svc.id ?? "default-consultation"}
                  type="button"
                  role="radio"
                  tabIndex={on ? 0 : -1}
                  aria-checked={on}
                  onClick={() => { setSelectedServiceId(svc.id ?? null); setCachedOrder(null); }}
                  className={chipBase + (on ? chipOn : chipOff)}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-ds-small font-semibold">{svc.name}</span>
                    <span className="block text-ds-label text-ds-ink-2">{svc.duration} min</span>
                  </span>
                  <span className="shrink-0 font-semibold ds-tabular">₹{svc.price}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
          )}
        </div>
      )}

      {!noOpenDays && <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <div className="mb-2 flex h-6 items-center">
            <h3 className="text-ds-label font-semibold uppercase tracking-[0.08em] text-ds-ink-2">Select Date</h3>
          </div>
          <DatePicker
            id="bk-date"
            value={selectedDate}
            fromDate={days[0]}
            toDate={days[days.length - 1]}
            disabled={checkingSlot}
            isAvailable={(d) => days.some((day) => isSameDay(day, d)) && Boolean(bookingHours.find((h) => h.day_of_week === d.getDay())?.is_open)}
            onChange={(d) => { setSelectedDate(d); setSelectedTime(""); setStep(3); }}
          />
        </div>
        <div>
          <div className="mb-2 flex h-6 items-center justify-between gap-3">
            <h3 className="text-ds-label font-semibold uppercase tracking-[0.08em] text-ds-ink-2">Select Time Slot</h3>
            {selectedDate && availableTimeSlots.length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-ds-label font-medium text-ds-live ds-tabular">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-ds-live-dot" />
                {availableTimeSlots.length} available
              </span>
            )}
          </div>
          <TimePicker
            id="bk-time"
            slots={availableTimeSlots}
            value={pickedTime}
            disabled={checkingSlot || !selectedDate}
            emptyLabel={selectedDate ? "No times available" : "Choose a date first"}
            onChange={pickTime}
          />
        </div>
      </div>}

      {noOpenDays ? null : !selectedDate ? (
        <p className="rounded-ds-md border border-dashed border-ds-line px-4 py-6 text-center text-ds-small text-ds-ink-2">
          No dates are open for booking right now. Please contact the clinic.
        </p>
      ) : availableTimeSlots.length === 0 ? (
        <p className="rounded-ds-md border border-dashed border-ds-line px-4 py-6 text-center text-ds-small text-ds-ink-2">
          No time slots are available for this date. Please select another date.
        </p>
      ) : null}
    </div>
  );

  // The "When" step's summary + Continue, as the card's footer: full width, flush with its bottom edge.
  const renderWhenFooter = () =>
    step >= 1 && step <= 3 && selectedDate && availableTimeSlots.length > 0 ? (
      <div className="border-t border-ds-line bg-ds-paper-2/70 px-5 py-4 sm:px-9 sm:py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-ds-small text-ds-ink-2">
              <span className="block font-semibold text-ds-ink ds-tabular">
                {format(selectedDate, "EEE, d MMM")}{pickedTime ? ` · ${slotLabel(pickedTime)}` : ""}
              </span>
              {selectedService.name} · <span className="ds-tabular">₹{selectedService.price}</span>
            </p>
            <DsButton size="lg" className="w-full sm:w-auto sm:min-w-[13rem]" disabled={!pickedTime || checkingSlot} onClick={() => selectTimeSlot(pickedTime)}>
              {checkingSlot ? "Checking…" : <>Continue · {slotLabel(pickedTime)}</>}
            </DsButton>
          </div>
          <p className="mt-3 text-ds-label text-ds-ink-3">Only free times are listed, and the list updates live.</p>
      </div>
    ) : null;

  const ageInvalid = age !== "" && (Number(age) < 0 || Number(age) > 120);
  const fieldClass =
    "h-12 w-full rounded-ds-sm border bg-ds-surface px-4 text-ds-body text-ds-ink outline-none transition-colors placeholder:text-ds-ink-3 focus:border-ds-accent ";

  const phoneShowError = Boolean(phone) && !isValidIndianPhone(phone) && (phoneTouched || phone.replace(/\D/g, "").length >= 10);
  const missingDetails = !name.trim() || !phone || !age || !gender || !complaint.trim() || !selectedTime;

  const renderWho = () => (
    <form
      noValidate
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (submitting) return;
        if (missingDetails) {
          // Guide instead of staying dead: say what is missing and move to the first empty field.
          setAttempted(true);
          if (!name.trim()) document.getElementById("bk-name")?.focus();
          else if (!phone) document.getElementById("bk-phone")?.focus();
          else if (!age) document.getElementById("bk-age")?.focus();
          else if (!gender) document.getElementById("bk-gender")?.focus();
          else if (!complaint.trim()) document.getElementById("bk-reason")?.focus();
          return;
        }
        if (wantsOnlinePayment) proceedToReview();
        else void submitBooking();
      }}
    >
      <div className="flex items-center justify-between gap-4 rounded-ds-md border border-ds-line bg-ds-paper-2 px-4 py-3.5">
        <div className="min-w-0">
          <p className="font-semibold ds-tabular"><span className="whitespace-nowrap">{dayLabel}</span> · <span className="whitespace-nowrap">{selectedTime ? slotLabel(selectedTime) : ""}</span></p>
          <p className="truncate text-ds-small text-ds-ink-2">{selectedService?.name} · ₹{selectedService?.price}</p>
        </div>
        <button type="button" disabled={submitting} onClick={() => setStep(3)} className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-ds-small font-medium text-ds-accent-ink underline-offset-4 hover:underline">
          Change
        </button>
      </div>

      <h3 className="font-ds-display text-ds-h3 font-medium">Patient Details</h3>
      <p className="-mt-3 text-ds-small text-ds-ink-2">Fields marked * are needed to book.</p>

      <div>
        <label htmlFor="bk-name" className="mb-1.5 block text-ds-small font-medium">Full name<Req /></label>
        <input id="bk-name" name="name" type="text" autoFocus autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} className={fieldClass + "border-ds-line"} />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="bk-phone" className="mb-1.5 block text-ds-small font-medium">Mobile number<Req /></label>
          <div className="flex items-stretch gap-2">
            <span aria-hidden="true" className="flex w-14 shrink-0 items-center justify-center rounded-ds-sm border border-ds-line bg-ds-paper-2 text-ds-small text-ds-ink-2">+91</span>
            <input
              id="bk-phone"
              name="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              maxLength={13}
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => setPhoneTouched(true)}
              aria-invalid={phoneShowError ? true : undefined}
              aria-describedby={phoneShowError ? "bk-phone-error" : undefined}
              className={fieldClass + "min-w-0 " + (phoneShowError ? "border-ds-danger" : "border-ds-line")}
            />
          </div>
          {phoneShowError && (
            <p id="bk-phone-error" role="alert" className="mt-1.5 text-ds-small text-ds-danger">{phoneErrorMessage}</p>
          )}
        </div>
        <div>
          <label htmlFor="bk-email" className="mb-1.5 block text-ds-small font-medium">Email</label>
          <input id="bk-email" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="For your booking confirmation" className={fieldClass + "border-ds-line"} />
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="bk-age" className="mb-1.5 block text-ds-small font-medium">Age<Req /></label>
          <input
            id="bk-age"
            name="age"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={3}
            required
            value={age}
            onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))}
            aria-invalid={ageInvalid ? true : undefined}
            aria-describedby={ageInvalid ? "bk-age-error" : undefined}
            className={fieldClass + (ageInvalid ? "border-ds-danger" : "border-ds-line")}
          />
          {ageInvalid && <p id="bk-age-error" role="alert" className="mt-1.5 text-ds-small text-ds-danger">Please enter an age between 0 and 120.</p>}
        </div>
        <div>
          <label htmlFor="bk-gender" className="mb-1.5 block text-ds-small font-medium">Gender<Req /></label>
          {/* A native select: one tap opens the phone's own picker, and it is fully keyboard accessible. */}
          <div className="relative">
            <select
              id="bk-gender"
              name="gender"
              required
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className={fieldClass + "appearance-none border-ds-line pr-11 " + (gender ? "" : "text-ds-ink-3")}
            >
              <option value="" disabled>Select gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
            <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ds-ink-3" />
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="bk-reason" className="mb-1.5 block text-ds-small font-medium">Reason for visit<Req /></label>
        <textarea id="bk-reason" name="reason" rows={3} required value={complaint} onChange={(e) => setComplaint(e.target.value)} className="w-full resize-none rounded-ds-sm border border-ds-line bg-ds-surface px-4 py-3 text-ds-body outline-none transition-colors focus:border-ds-accent" />
      </div>

      <p className="text-ds-label text-ds-ink-3">
        By booking, you agree to Doctylia's{" "}
        <a href="/terms" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ds-ink">Terms of Service</a> and{" "}
        <a href="/privacy" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ds-ink">Privacy Policy</a>.
      </p>

      {missingDetails && !submitting && (
        <p
          id="bk-hint"
          role={attempted ? "alert" : undefined}
          className={`text-center text-ds-small ${attempted ? "font-medium text-ds-danger" : "text-ds-ink-2"}`}
        >
          {selectedTime ? "Enter your name, mobile number, age, gender and reason for visit to continue." : "Choose a time first."}
        </p>
      )}
      {wantsOnlinePayment ? (
        <DsButton type="submit" size="lg" className="w-full">
          Continue
        </DsButton>
      ) : (
        <DsButton type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? "Booking..." : `Confirm booking · ₹${selectedService?.price}`}
        </DsButton>
      )}
    </form>
  );

  const renderReview = () => (
    <div className="space-y-6">
      <h3 className="flex flex-wrap items-center gap-3 font-ds-display text-ds-h3 font-medium">
        Review Booking Summary {paymentModeIsMock && <TestModeBadge />}
      </h3>
      <p className="-mt-3 text-ds-small text-ds-ink-2">Please review your details before payment.</p>

      <div className="rounded-ds-md border border-ds-line bg-ds-paper-2 p-5">
        {[
          ["Appointment", [
            ["Doctor Name", doctorLabel],
            ["Consultation Type", type === "clinic" ? "Clinic Visit" : "Online Consultation"],
            ["Service", selectedService?.name || ""],
            ["Appointment Date", selectedDate ? format(selectedDate, "EEEE, d MMMM yyyy") : ""],
            ["Appointment Time", selectedTime ? slotLabel(selectedTime) : ""],
          ]],
          ["Patient", [
            ["Patient Name", name],
            ["Mobile Number", phone ? `+91 ${phone}` : ""],
            ["Email", email],
            ["Age", age],
            ["Gender", gender ? gender.charAt(0).toUpperCase() + gender.slice(1) : ""],
          ]],
        ].map(([heading, rows], index) => (
          <div key={heading as string} className={index > 0 ? "mt-5 border-t border-ds-line pt-5" : ""}>
            <p className="mb-2 text-ds-label font-medium uppercase tracking-[0.08em] text-ds-ink-3">{heading as string}</p>
            <div className="space-y-1.5">
              {(rows as [string, string][]).map(([label, value]) => <SummaryRow key={label} label={label} value={value} />)}
            </div>
          </div>
        ))}
        <div className="mt-5 flex items-baseline justify-between border-t border-ds-line pt-5">
          <span className="text-ds-body text-ds-ink-2">Total Amount</span>
          <span className="font-ds-display text-[1.75rem] font-medium ds-tabular">₹{selectedService?.price ?? 0}</span>
        </div>
      </div>

      {payError && (
        <div role="alert" className="flex items-start gap-2.5 rounded-ds-md border border-ds-danger/30 bg-ds-danger/[0.06] p-4 text-ds-small text-ds-ink">
          <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ds-danger" />
          <div>
            <p className="font-semibold">Booking not completed</p>
            <p className="mt-0.5 text-ds-ink-2">{payError}</p>
          </div>
        </div>
      )}

      <div className="flex gap-2.5">
        <DsButton variant="secondary" size="lg" className="flex-1" onClick={() => setStep(4)}>Back</DsButton>
        <DsButton size="lg" className="flex-[2]" disabled={submitting} onClick={payNow}>
          {submitting ? "Processing..." : "Pay Now"}
        </DsButton>
      </div>
    </div>
  );

  return (
    <>
      <section id="booking" aria-labelledby="booking-heading" ref={zoneRef} className="ds-dots bg-ds-paper py-[4.5rem] md:py-32">
        <div className="mx-auto grid max-w-[1200px] gap-8 px-5 sm:px-6 lg:grid-cols-12 lg:gap-x-14 lg:gap-y-10 lg:px-8">
          <div className="lg:col-span-5 lg:row-start-1">
            <SectionHeader
              id="booking-heading"
              eyebrow="Book online"
              title="Book an appointment"
              intro="Pick a time, tell us who is coming, and you're booked. It takes about a minute."
              headingAttrs={{ "data-booking-start": "" }}
            />
          </div>

          <div className="lg:col-span-5 lg:row-start-2">
            <BookingAside
              profile={doctorProfile}
              service={selectedService}
              type={type}
              autoConfirm={Boolean(settings?.auto_confirm)}
              payOnline={wantsOnlinePayment}
              cutoffHours={settings?.cancellation_cutoff_hours ?? 2}
            />
          </div>

          <div
            id="booking-card"
            className="ds-glass relative overflow-hidden rounded-ds-lg !shadow-ds-2 lg:sticky lg:top-28 lg:col-span-7 lg:col-start-6 lg:row-span-2 lg:row-start-1 lg:self-start"
          >
            <div className="p-5 sm:p-9">
            {stepHeader()}

            <div ref={stepRegionRef} tabIndex={-1} className="outline-none">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={visibleStep}
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: DUR.small, ease: EASE.out }}
              >
                {step === 0 && isMultiDoctor && renderDoctor()}
                {step >= 1 && step <= 3 && renderWhen()}
                {step === 4 && renderWho()}
                {step === 5 && wantsOnlinePayment && renderReview()}
              </motion.div>
            </AnimatePresence>
            </div>
            </div>
            {renderWhenFooter()}
          </div>
        </div>
      </section>
      {cachedOrder?.mode === "mock" && (
        <MockCheckoutModal
          open={mockCheckoutOpen}
          paymentId={cachedOrder.payment_id}
          amount={selectedService?.price ?? 0}
          doctorName={doctorLabel}
          serviceName={selectedService?.name}
          dateLabel={selectedDate ? format(selectedDate, "d MMM yyyy") : undefined}
          timeLabel={selectedTime}
          onResult={(response) => handleCheckoutResult(cachedOrder, response)}
          onFailed={handleCheckoutFailure}
          onDismiss={handleCheckoutDismiss}
        />
      )}
    </>
  );
};

export default BookingWidget;
