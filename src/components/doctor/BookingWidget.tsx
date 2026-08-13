import { useState, useMemo, useEffect } from "react";
import { CheckCircle2, XCircle, ChevronLeft, Video, Users, Clock, FileText, Building2, Receipt } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useDoctorData } from "@/contexts/DoctorContext";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays, isSameDay } from "date-fns";
import { toast } from "sonner";
import { useSlotAvailability } from "@/hooks/useSlotAvailability";
import { isValidIndianPhone, normalizeIndianPhone, phoneErrorMessage } from "@/lib/phone";
import { edgeFunctionErrorMessage } from "@/lib/edgeFunctionError";
import { downloadPdfFromNode } from "@/lib/downloadPdfFromNode";
import { usePaymentMode } from "@/hooks/usePaymentMode";
import TestModeBadge from "@/components/shared/TestModeBadge";
import { loadRazorpayCheckout } from "@/lib/razorpayCheckout";
import AppointmentSlip from "./AppointmentSlip";
import PaymentSlip from "./PaymentSlip";
import MockCheckoutModal from "./MockCheckoutModal";

const getNextDays = (count: number) => {
  const days = [];
  const today = new Date();
  for (let i = 0; i < count; i++) days.push(addDays(today, i));
  return days;
};

const generateTimeSlots = (start: string | null, end: string | null) => {
  if (!start || !end) return [];
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

const SummaryRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-3">
    <span className="text-text-gray">{label}</span>
    <span className="text-foreground font-medium text-right break-words">{value || "—"}</span>
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
// instead of minting a new one each time — one payments row per booking
// attempt, never a duplicate appointment.
type CachedOrder = {
  payment_id: string;
  order_id: string;
  key_id: string;
  amount: number;
  currency: string;
  mode: "mock" | "live";
};

type CheckoutResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };

const STEP_LABELS = ["Consultation Type", "Select Service", "Select Date", "Select Time", "Patient Details", "Review & Pay"];

const BookingWidget = () => {
  const { profile, services, settings, workingHours, isPremium } = useDoctorData();
  const { isMock: paymentModeIsMock } = usePaymentMode();
  const [step, setStep] = useState(1);
  const [type, setType] = useState<"clinic" | "online">("clinic");
  const [selectedService, setSelectedService] = useState<any>(null);
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
  const [paymentFailureMessage, setPaymentFailureMessage] = useState("");
  const [token, setToken] = useState("");
  const [patientsAhead, setPatientsAhead] = useState<number | null>(null);
  const [confirmedApptId, setConfirmedApptId] = useState<string | null>(null);
  const [slipOpen, setSlipOpen] = useState(false);
  const [paymentSlipOpen, setPaymentSlipOpen] = useState(false);
  const [mockCheckoutOpen, setMockCheckoutOpen] = useState(false);

  useEffect(() => { if (confirmed) setSlipOpen(true); }, [confirmed]);

  // Any time the patient steps back before Review (to change service, date,
  // time, or their own details), the previously cached Razorpay order no
  // longer matches what would be booked — drop it so the next "Pay Now"
  // creates a fresh order instead of silently booking stale details.
  useEffect(() => { if (step < 6) setCachedOrder(null); }, [step]);

  const advanceDays = settings?.booking_advance_days || 7;
  const days = useMemo(() => getNextDays(advanceDays), [advanceDays]);

  const dayOfWeek = selectedDate ? selectedDate.getDay() : -1;
  const wh = workingHours.find((h) => h.day_of_week === dayOfWeek);

  const rawTimeSlots = wh?.is_open
    ? [...generateTimeSlots(wh.start_time, wh.end_time), ...generateTimeSlots(wh.start_time_2, wh.end_time_2)]
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
    ...(isPremium ? [{ k: "online" as const, label: "Online", Icon: Video }] : []),
  ];

  const filteredServices = services.filter((s) =>
    type === "online" ? s.type === "online" || s.type === "both" : s.type === "clinic" || s.type === "both"
  );
  // Fallback: if the doctor hasn't defined any matching service, offer a default
  // consultation so patients can still book (clinic or online).
  const defaultFee = (settings as any)?.default_consultation_fee || 500;
  const availableServices = filteredServices.length > 0 ? filteredServices : [{
    id: `default-${type}`,
    name: type === "online" ? "Online Consultation" : "Clinic Consultation",
    price: defaultFee,
    duration: 15,
    type,
  }];

  const maxPerSlot = (settings as any)?.max_per_slot || 1;
  const dateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;
  const { isFull, bookedIn, refresh } = useSlotAvailability(profile?.id, dateStr, maxPerSlot);

  const wantsOnlinePayment = Boolean(settings?.require_payment);
  const totalSteps = wantsOnlinePayment ? 6 : 5;

  const validatePatientDetails = () => {
    if (!name || !phone || !age || !gender) return false;
    if (!isValidIndianPhone(phone)) { toast.error(phoneErrorMessage); return false; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error("Enter a valid email or leave it blank."); return false; }
    return true;
  };

  // Pay at Clinic booking — appointment is created immediately (unchanged
  // behaviour). Only used when the doctor has NOT turned on Require Online
  // Payment; the online-payment path below never calls this.
  const createAppointmentRow = async (): Promise<{ id: string; token: string } | null> => {
    if (!profile || !selectedService || !selectedDate || !selectedTime) return null;
    if (!validatePatientDetails()) return null;
    const normalizedPhone = normalizeIndianPhone(phone);
    const tkn = `T${Math.floor(Math.random() * 900) + 100}`;
    const dStr = format(selectedDate, "yyyy-MM-dd");

    const { data: inserted, error } = await supabase
      .from("appointments")
      .insert({
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
      })
      .select("id")
      .single();

    if (error) {
      if (error.message?.includes("SLOT_FULL")) {
        toast.error("Sorry, this slot was just booked by someone else. Please choose another time.");
        setStep(4);
        setSelectedTime("");
        refresh();
        return null;
      }
      if (error.message?.includes("SLOT_IN_PAST")) {
        toast.error("That time has already passed — please pick a later slot.");
        setStep(4); setSelectedTime(""); refresh();
        return null;
      }
      toast.error("Booking failed. Please try again.");
      return null;
    }

    return { id: inserted.id, token: tkn };
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
      .then(({ data: qp }: { data: unknown }) => setPatientsAhead(typeof qp === "number" ? qp : 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmed, confirmedApptId]);

  const submitBooking = async () => {
    if (submitting) return;
    setSubmitting(true);
    // BUG-04: Do NOT create the patient record on booking. Patient rows are
    // created/updated only when the doctor marks an appointment "completed".
    const created = await createAppointmentRow();
    if (created) finalizeConfirmed(created.id, created.token, "pay_at_clinic");
    setSubmitting(false);
  };

  const reset = () => {
    setStep(1); setType("clinic"); setSelectedService(null); setSelectedDate(null);
    setSelectedTime(""); setName(""); setPhone(""); setEmail(""); setAge(""); setGender(""); setComplaint("");
    setConfirmed(false); setConfirmedPaymentStatus("pay_at_clinic"); setPaymentMeta(null);
    setCachedOrder(null); setPaymentFailed(false); setPaymentFailureMessage(""); setMockCheckoutOpen(false);
    setToken(""); setPatientsAhead(null); setConfirmedApptId(null);
  };

  const downloadSlip = () => downloadPdfFromNode('[data-slip-print-root] .slip-card', `appointment-${token}.pdf`);
  const downloadPaymentSlip = () => downloadPdfFromNode('[data-payment-slip-print-root] .slip-card', `payment-receipt-${token}.pdf`);

  // "Download Appointment/Payment Slip" on the confirmation screen open the
  // (printable) slip dialog and immediately trigger the PDF download once its
  // content has mounted — one click, automatically generated, no second step.
  const handleDownloadAppointmentSlip = () => {
    setSlipOpen(true);
    setTimeout(downloadSlip, 350);
  };
  const handleDownloadPaymentSlip = () => {
    setPaymentSlipOpen(true);
    setTimeout(downloadPaymentSlip, 350);
  };

  // Step 5 "Continue" for online-payment doctors — just moves to the Review
  // Booking Summary step. Nothing is written to the database here.
  const proceedToReview = () => {
    if (!validatePatientDetails()) return;
    setStep(6);
  };

  // Opens a Razorpay order for the current booking details (or reuses one
  // already cached for this Review session) — no appointment or DB row for
  // the appointment itself is created here, only a `payments` row holding
  // the pending booking payload.
  const ensureOrder = async (): Promise<CachedOrder | null> => {
    if (cachedOrder) return cachedOrder;
    if (!profile || !selectedService || !selectedDate || !selectedTime) return null;
    if (isFull(selectedTime)) {
      toast.error("Sorry, this slot was just booked by someone else. Please choose another time.");
      setStep(4); setSelectedTime(""); refresh();
      return null;
    }

    const dStr = format(selectedDate, "yyyy-MM-dd");
    const bookingPayload = {
      doctor_id: profile.id,
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
    };

    const { data: orderData, error: orderErr } = await supabase.functions.invoke("create-razorpay-order", {
      body: bookingPayload,
    });

    if (orderErr || !orderData?.order_id) {
      const message = await edgeFunctionErrorMessage(orderErr, "Online payment isn't available right now.");
      if (message.includes("SLOT_FULL")) {
        toast.error("Sorry, this slot was just booked by someone else. Please choose another time.");
        setStep(4); setSelectedTime(""); refresh();
      } else if (message.includes("SLOT_IN_PAST")) {
        toast.error("That time has already passed — please pick a later slot.");
        setStep(4); setSelectedTime(""); refresh();
      } else {
        toast.error("Online payment isn't active yet for this clinic.", { description: "Please contact the clinic to book, or try again shortly." });
      }
      return null;
    }

    const order: CachedOrder = {
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
  // "Simulate Successful Payment" / "Simulate Signature Mismatch" — every
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
      const message = await edgeFunctionErrorMessage(
        verifyErr,
        "Payment verification failed. Please contact the clinic with your payment ID.",
      );
      setMockCheckoutOpen(false);
      setPaymentFailureMessage(message);
      setPaymentFailed(true);
      setSubmitting(false);
      return; // No appointment was created.
    }

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
  // "Simulate Failed Payment" / "Payment Timeout" — a genuine failure (as
  // opposed to the patient just closing the modal) sends them to the
  // dedicated Payment Failed screen.
  const handleCheckoutFailure = (message: string) => {
    setMockCheckoutOpen(false);
    setPaymentFailureMessage(message);
    setPaymentFailed(true);
    setSubmitting(false);
  };

  // Cancelled, not failed — keep the cached order so a follow-up "Pay Now"
  // click on the Review step reuses it instead of minting a new one.
  const handleCheckoutDismiss = () => {
    setSubmitting(false);
    setMockCheckoutOpen(false);
    toast.info("Payment cancelled.", { description: "No appointment was created. You can try again anytime." });
  };

  // Opens Checkout for an already-created order and verifies the result. The
  // appointment is created ONLY inside verify-razorpay-payment, and only
  // after the payment signature is verified — so a failed/cancelled payment
  // never books anything, and a successful one can never be applied twice
  // (idempotent on payment_id). In mock mode this opens MockCheckoutModal
  // instead of loading the real Razorpay script — everything past this point
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
      name: profile?.clinic_name || (profile?.full_name ? `Dr. ${profile.full_name}` : "Doctylia"),
      description: selectedService?.name,
      prefill: { name, contact: normalizeIndianPhone(phone), email: email || undefined },
      theme: { color: "#1e3a8a" },
      handler: (response: CheckoutResponse) => handleCheckoutResult(order, response),
      modal: { ondismiss: handleCheckoutDismiss },
    });
    rzp.on("payment.failed", (resp: { error?: { description?: string } }) => {
      handleCheckoutFailure(resp?.error?.description || "Your payment could not be completed. Please try again.");
    });
    rzp.open();
  };

  // Review Summary "Pay Now" AND the Payment Failed screen's "Retry Payment"
  // both call this — retry reuses the cached order (same payments row) so a
  // second attempt never creates a second appointment record.
  const payNow = async () => {
    if (submitting) return;
    if (!validatePatientDetails()) return;
    setSubmitting(true);
    const order = await ensureOrder();
    if (!order) { setSubmitting(false); return; }
    await openCheckout(order);
  };

  const estWaitMinutes = (patientsAhead ?? 0) * (selectedService?.duration || 15);

  if (confirmed) {
    return (
      <section id="booking" className="py-16 md:py-24 bg-cloud-blue">
        <div className="container mx-auto px-4 max-w-lg">
          <div className="bg-card rounded-2xl shadow-xl p-8 text-center">
            <CheckCircle2 size={64} className="text-success mx-auto mb-4" />
            <h3 className="font-heading font-bold text-2xl text-foreground mb-2">
              {confirmedPaymentStatus === "paid" ? "Booking Successful!" : `Appointment ${settings?.auto_confirm ? "Confirmed" : "Requested"}!`}
            </h3>
            <p className="text-text-gray mb-4">Token #{token}</p>
            <div className="bg-secondary rounded-xl p-4 text-left space-y-2 text-sm mb-4">
              <p><strong>Appointment ID:</strong> {token}</p>
              <p><strong>Doctor:</strong> Dr. {profile?.full_name}</p>
              <p><strong>Consultation Type:</strong> {type === "clinic" ? "Clinic Visit" : "Online"}</p>
              <p><strong>Service:</strong> {selectedService?.name}</p>
              <p><strong>Date:</strong> {selectedDate && format(selectedDate, "EEEE, d MMMM")}</p>
              <p><strong>Time:</strong> {selectedTime}</p>
              <p><strong>Patient:</strong> {name}</p>
              <p>
                <strong>{confirmedPaymentStatus === "paid" ? "Amount Paid" : "Amount"}:</strong>{" "}
                ₹{confirmedPaymentStatus === "paid" ? (paymentMeta?.amount ?? selectedService?.price ?? 0) : (selectedService?.price ?? 0)}
              </p>
            </div>

            {confirmedPaymentStatus === "paid" && (
              <div className="mb-4 p-3 rounded-xl bg-success/10 border border-success/20 text-left text-sm text-success flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Payment received — you're all paid up for this appointment.</span>
              </div>
            )}

            {type === "clinic" && patientsAhead !== null && (
              <div className="mb-4 p-3 rounded-xl bg-royal/5 border border-royal/20 text-left text-sm text-royal">
                <div className="flex items-center gap-2 font-semibold">
                  <Users className="h-4 w-4" />
                  {patientsAhead === 0
                    ? "You're first in line — no wait!"
                    : `${patientsAhead} patient${patientsAhead > 1 ? "s" : ""} ahead of you`}
                </div>
                {patientsAhead > 0 && (
                  <div className="mt-1 text-xs text-royal/80 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Estimated wait ~{estWaitMinutes} min
                  </div>
                )}
              </div>
            )}

            {type === "online" && (
              <div className="mb-4 p-3 rounded-xl bg-teal/10 border border-teal/20 text-left text-sm text-teal flex items-start gap-2">
                <Video className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Your video consultation link will be shared with you 1 hour before your appointment.</span>
              </div>
            )}

            {profile?.slug && (
              <a
                href={`/dr/${profile.slug}/manage?token=${encodeURIComponent(token)}&phone=${encodeURIComponent(phone)}`}
                className="block text-xs text-royal hover:underline mb-4"
              >
                Manage this appointment (cancel or reschedule) →
              </a>
            )}
            <div className="flex flex-wrap gap-2 justify-center">
              <Button onClick={handleDownloadAppointmentSlip} className="gap-1.5 bg-royal hover:bg-royal/90 text-white">
                <FileText className="h-4 w-4" /> Download Appointment Slip
              </Button>
              {confirmedPaymentStatus === "paid" && (
                <Button onClick={handleDownloadPaymentSlip} variant="outline" className="gap-1.5">
                  <Receipt className="h-4 w-4" /> Download Payment Slip
                </Button>
              )}
              <Button variant="outline" onClick={reset}>Book Another</Button>
            </div>
          </div>
        </div>

        <AppointmentSlip
          open={slipOpen}
          onClose={() => setSlipOpen(false)}
          profile={profile}
          settings={settings}
          token={token}
          service={selectedService}
          type={type}
          date={selectedDate}
          time={selectedTime}
          patientName={name}
          patientPhone={phone}
          paymentStatus={confirmedPaymentStatus}
          forceConfirmed={confirmedPaymentStatus === "paid" ? true : undefined}
          onDownload={downloadSlip}
        />

        {confirmedPaymentStatus === "paid" && paymentMeta && (
          <PaymentSlip
            open={paymentSlipOpen}
            onClose={() => setPaymentSlipOpen(false)}
            profile={profile}
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
      </section>
    );
  }

  // Payment genuinely failed (Razorpay's payment.failed event) or our own
  // verification rejected it — as opposed to the patient simply closing the
  // Checkout modal, which just returns them to Review Summary with a toast.
  // No appointment exists yet either way; Retry Payment reuses the same
  // cached order so retrying never creates a duplicate.
  if (paymentFailed) {
    return (
      <section id="booking" className="py-16 md:py-24 bg-cloud-blue">
        <div className="container mx-auto px-4 max-w-lg">
          <div className="bg-card rounded-2xl shadow-xl p-8 text-center">
            <XCircle size={64} className="text-destructive mx-auto mb-4" />
            <h3 className="font-heading font-bold text-2xl text-foreground mb-2 flex items-center justify-center gap-2 flex-wrap">
              Payment Failed {paymentModeIsMock && <TestModeBadge />}
            </h3>
            <p className="text-text-gray mb-4">{paymentFailureMessage || "Your payment could not be completed."}</p>
            <div className="bg-secondary rounded-xl p-4 text-left space-y-2 text-sm mb-4">
              <p><strong>Doctor:</strong> Dr. {profile?.full_name}</p>
              <p><strong>Consultation Type:</strong> {type === "clinic" ? "Clinic Visit" : "Online"}</p>
              <p><strong>Service:</strong> {selectedService?.name}</p>
              <p><strong>Date:</strong> {selectedDate && format(selectedDate, "EEEE, d MMMM")}</p>
              <p><strong>Time:</strong> {selectedTime}</p>
              <p><strong>Amount:</strong> ₹{selectedService?.price ?? 0}</p>
            </div>
            <p className="text-xs text-muted-foreground mb-5">No appointment was created and you were not charged. You can safely retry.</p>
            <div className="flex flex-wrap gap-2 justify-center">
              <Button
                variant="cta"
                className="gap-1.5 font-heading font-semibold"
                disabled={submitting}
                onClick={() => { setPaymentFailed(false); payNow(); }}
              >
                {submitting ? "Retrying..." : "Retry Payment"}
              </Button>
              <Button
                variant="outline"
                onClick={() => { setPaymentFailed(false); setCachedOrder(null); setStep(5); }}
              >
                Edit Booking Details
              </Button>
            </div>
          </div>
        </div>

        {cachedOrder?.mode === "mock" && (
          <MockCheckoutModal
            open={mockCheckoutOpen}
            paymentId={cachedOrder.payment_id}
            amount={selectedService?.price ?? 0}
            doctorName={`Dr. ${profile?.full_name || ""}`}
            serviceName={selectedService?.name}
            dateLabel={selectedDate ? format(selectedDate, "d MMM yyyy") : undefined}
            timeLabel={selectedTime}
            onResult={(response) => handleCheckoutResult(cachedOrder, response)}
            onFailed={handleCheckoutFailure}
            onDismiss={handleCheckoutDismiss}
          />
        )}
      </section>
    );
  }

  return (
    <section id="booking" className="py-16 md:py-24 bg-cloud-blue">
      <div className="container mx-auto px-4 max-w-2xl">
        <h2 className="font-heading font-bold text-3xl md:text-4xl text-foreground text-center mb-2">Book an Appointment</h2>
        <p className="text-text-gray text-center mb-4">Select your preference and book in under 2 minutes</p>
        {profile?.slug && (
          <p className="text-center text-sm mb-6">
            <a href={`/dr/${profile.slug}/manage`} className="text-royal hover:underline">
              Already booked? Manage your appointment →
            </a>
          </p>
        )}

        <div className="bg-card rounded-2xl shadow-xl p-6 md:p-8">
          <p className="text-xs font-semibold text-royal mb-2 tracking-wide">
            Step {step} of {totalSteps} — {STEP_LABELS[step - 1]}
          </p>
          <div className="flex gap-1 mb-6">
            {Array.from({ length: totalSteps }, (_, i) => i + 1).map((s) => (
              <div key={s} className={`h-1 flex-1 rounded-pill transition-colors ${s <= step ? "gradient-hero" : "bg-muted"}`} />
            ))}
          </div>

          {step > 1 && (
            <button onClick={() => setStep(step - 1)} className="flex items-center gap-1 text-sm text-royal mb-4 hover:underline">
              <ChevronLeft size={16} /> Back
            </button>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h3 className="font-heading font-semibold text-lg text-foreground">Select Consultation Type</h3>
              <div className={`grid gap-4 ${consultationTypes.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                {consultationTypes.map((t) => (
                  <button key={t.k} onClick={() => { setType(t.k); setStep(2); }}
                    className={`flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border-2 font-heading font-semibold text-lg transition-all ${type === t.k ? "border-royal bg-royal/5 text-royal" : "border-border text-foreground hover:border-royal/50"}`}>
                    <t.Icon size={24} />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h3 className="font-heading font-semibold text-lg text-foreground">Select Service</h3>
              <div className="space-y-2">
                {availableServices.map((s) => (
                  <button key={s.id} onClick={() => { setSelectedService(s); setStep(3); }}
                    className={`w-full p-4 rounded-xl border-2 text-left flex justify-between items-center transition-all ${selectedService?.id === s.id ? "border-royal bg-royal/5" : "border-border hover:border-royal/50"}`}>
                    <div>
                      <span className="font-medium text-foreground">{s.name}</span>
                      {s.duration && <span className="text-xs text-text-gray ml-2">{s.duration} min</span>}
                    </div>
                    <span className="font-heading font-bold text-royal">₹{s.price}</span>
                  </button>
                ))}
                {availableServices.length === 0 && <p className="text-muted-foreground text-sm">No services available for this type.</p>}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h3 className="font-heading font-semibold text-lg text-foreground">Select Date</h3>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {days.map((d, i) => {
                  const dow = d.getDay();
                  const dwh = workingHours.find((h) => h.day_of_week === dow);
                  const closed = !dwh?.is_open;
                  return (
                    <button key={i} disabled={closed} onClick={() => { setSelectedDate(d); setStep(4); }}
                      className={`flex-shrink-0 w-20 py-3 rounded-xl border-2 text-center transition-all ${closed ? "opacity-40 cursor-not-allowed border-border" : selectedDate?.getTime() === d.getTime() ? "border-royal bg-royal/5" : "border-border hover:border-royal/50"}`}>
                      <p className="text-xs text-text-gray">{format(d, "EEE")}</p>
                      <p className="font-heading font-bold text-lg text-foreground">{d.getDate()}</p>
                      <p className="text-xs text-text-gray">{format(d, "MMM")}</p>
                      {closed && <p className="text-[10px] text-destructive mt-1">Closed</p>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h3 className="font-heading font-semibold text-lg text-foreground">Select Time Slot</h3>
              <p className="text-xs text-muted-foreground">Live availability — full slots update automatically.</p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {timeSlots.map((t) => {
                  const full = isFull(t);
                  return (
                    <button
                      key={t}
                      disabled={full}
                      onClick={() => { setSelectedTime(t); setStep(5); }}
                      className={`py-3 rounded-lg border-2 text-sm font-medium transition-all relative ${
                        full
                          ? "border-border bg-muted text-muted-foreground cursor-not-allowed opacity-60"
                          : selectedTime === t
                          ? "border-royal bg-royal text-primary-foreground"
                          : "border-border text-foreground hover:border-royal"
                      }`}
                    >
                      {t}
                      {full ? (
                        <span className="block text-[9px] mt-0.5 font-semibold uppercase text-destructive">Full</span>
                      ) : maxPerSlot > 1 ? (
                        <span className="block text-[9px] mt-0.5 opacity-70">{bookedIn(t)}/{maxPerSlot}</span>
                      ) : null}
                    </button>
                  );
                })}
                {timeSlots.length === 0 && <p className="text-muted-foreground text-sm col-span-full">No slots available for this date.</p>}
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <h3 className="font-heading font-semibold text-lg text-foreground">Patient Details</h3>
              <div className="space-y-3">
                <input type="text" placeholder="Full Name *" value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-royal" />
                <div className="flex items-center gap-2">
                  <span className="px-3 py-3 rounded-lg border border-border bg-secondary text-sm text-foreground">+91</span>
                  <input type="tel" inputMode="numeric" maxLength={13} placeholder="10-digit Mobile Number *" value={phone} onChange={(e) => setPhone(e.target.value)}
                    className="flex-1 px-4 py-3 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-royal" />
                </div>
                {phone && !isValidIndianPhone(phone) && (
                  <p className="text-[11px] text-destructive -mt-1">{phoneErrorMessage}</p>
                )}
                <input type="email" placeholder="Email (optional — for booking confirmation)" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-royal" />
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" placeholder="Age *" value={age} onChange={(e) => setAge(e.target.value)}
                    className="px-4 py-3 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-royal" />
                  <select value={gender} onChange={(e) => setGender(e.target.value)}
                    className="px-4 py-3 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-royal">
                    <option value="" disabled hidden>Gender</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
                  </select>
                </div>
                <textarea placeholder="Reason for visit (optional)" rows={2} value={complaint} onChange={(e) => setComplaint(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-royal resize-none" />
              </div>

              <div className="bg-secondary rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-text-gray">Service</span><span className="text-foreground font-medium">{selectedService?.name}</span></div>
                <div className="flex justify-between"><span className="text-text-gray">Date</span><span className="text-foreground font-medium">{selectedDate && format(selectedDate, "d MMM")}</span></div>
                <div className="flex justify-between"><span className="text-text-gray">Time</span><span className="text-foreground font-medium">{selectedTime}</span></div>
                <hr className="border-border" />
                <div className="flex justify-between font-heading font-bold text-lg"><span>Total</span><span className="text-royal">₹{selectedService?.price}</span></div>
              </div>

              {wantsOnlinePayment ? (
                <Button variant="cta" className="w-full font-heading font-semibold text-lg py-6"
                  disabled={!name || !phone || !age || !gender} onClick={proceedToReview}>
                  Continue
                </Button>
              ) : (
                <Button variant="cta" className="w-full font-heading font-semibold text-lg py-6"
                  disabled={!name || !phone || !age || !gender || submitting} onClick={submitBooking}>
                  {submitting ? "Booking..." : `Book Appointment — ₹${selectedService?.price}`}
                </Button>
              )}
            </div>
          )}

          {step === 6 && wantsOnlinePayment && (
            <div className="space-y-4">
              <h3 className="font-heading font-semibold text-lg text-foreground flex items-center gap-2 flex-wrap">
                Review Booking Summary {paymentModeIsMock && <TestModeBadge />}
              </h3>
              <p className="text-xs text-muted-foreground">Please review your details before payment.</p>

              <div className="bg-secondary rounded-xl p-4 space-y-4 text-sm">
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-royal">Appointment Details</p>
                  <div className="space-y-1.5">
                    <SummaryRow label="Doctor Name" value={`Dr. ${profile?.full_name || ""}`} />
                    <SummaryRow label="Consultation Type" value={type === "clinic" ? "Clinic Visit" : "Online Consultation"} />
                    <SummaryRow label="Appointment Date" value={selectedDate ? format(selectedDate, "EEEE, d MMMM yyyy") : ""} />
                    <SummaryRow label="Appointment Time" value={selectedTime} />
                  </div>
                </div>

                <hr className="border-border" />

                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-royal">Patient Details</p>
                  <div className="space-y-1.5">
                    <SummaryRow label="Patient Name" value={name} />
                    <SummaryRow label="Mobile Number" value={phone ? `+91 ${phone}` : ""} />
                    <SummaryRow label="Email" value={email} />
                    <SummaryRow label="Age" value={age} />
                    <SummaryRow label="Gender" value={gender ? gender.charAt(0).toUpperCase() + gender.slice(1) : ""} />
                  </div>
                </div>

                <hr className="border-border" />

                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-royal">Payment Details</p>
                  <div className="space-y-1.5">
                    <SummaryRow label="Consultation Fee" value={`₹${selectedService?.price ?? 0}`} />
                    <div className="flex justify-between font-heading font-bold text-lg pt-1">
                      <span className="text-foreground">Total Amount</span>
                      <span className="text-royal">₹{selectedService?.price ?? 0}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 h-12" onClick={() => setStep(5)}>
                  Back
                </Button>
                <Button variant="cta" className="flex-[2] h-12 font-heading font-semibold text-lg"
                  disabled={submitting} onClick={payNow}>
                  {submitting ? "Processing..." : "Pay Now"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {cachedOrder?.mode === "mock" && (
        <MockCheckoutModal
          open={mockCheckoutOpen}
          paymentId={cachedOrder.payment_id}
          amount={selectedService?.price ?? 0}
          doctorName={`Dr. ${profile?.full_name || ""}`}
          serviceName={selectedService?.name}
          dateLabel={selectedDate ? format(selectedDate, "d MMM yyyy") : undefined}
          timeLabel={selectedTime}
          onResult={(response) => handleCheckoutResult(cachedOrder, response)}
          onFailed={handleCheckoutFailure}
          onDismiss={handleCheckoutDismiss}
        />
      )}
    </section>
  );
};

export default BookingWidget;
