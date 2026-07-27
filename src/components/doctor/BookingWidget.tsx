import { useState, useMemo, useEffect } from "react";
import { CheckCircle2, ChevronLeft, Video, CreditCard, Users, Clock, Download } from "lucide-react";
import jsPDF from "jspdf";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { useDoctorData } from "@/contexts/DoctorContext";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays, isSameDay } from "date-fns";
import { toast } from "sonner";
import { useSlotAvailability } from "@/hooks/useSlotAvailability";
import { isValidIndianPhone, normalizeIndianPhone, phoneErrorMessage } from "@/lib/phone";

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

const BookingWidget = () => {
  const { profile, services, settings, workingHours } = useDoctorData();
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
  const [token, setToken] = useState("");
  const [patientsAhead, setPatientsAhead] = useState<number | null>(null);
  const [confirmedApptId, setConfirmedApptId] = useState<string | null>(null);

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

  const submitBooking = async () => {
    if (!profile || !selectedService || !selectedDate || !selectedTime || !name || !phone) return;
    if (!isValidIndianPhone(phone)) { toast.error(phoneErrorMessage); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error("Enter a valid email or leave it blank."); return; }
    setSubmitting(true);
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
        service_name: selectedService.name,
        appointment_type: type,
        date: dStr,
        time_slot: selectedTime,
        amount: selectedService.price,
        token_number: tkn,
        chief_complaint: complaint || null,
        status: (settings?.auto_confirm ? "confirmed" : "pending") as any,
        payment_status: "pay_at_clinic" as any,
      })
      .select("id")
      .single();

    if (error) {
      setSubmitting(false);
      if (error.message?.includes("SLOT_FULL")) {
        toast.error("Sorry, this slot was just booked by someone else. Please choose another time.");
        setStep(4);
        setSelectedTime("");
        refresh();
        return;
      }
      if (error.message?.includes("SLOT_IN_PAST")) {
        toast.error("That time has already passed — please pick a later slot.");
        setStep(4); setSelectedTime(""); refresh();
        return;
      }
      toast.error("Booking failed. Please try again.");
      return;
    }

    // BUG-04: Do NOT create the patient record on booking. Patient rows are
    // created/updated only when the doctor marks an appointment "completed".

    // Queue count (for clinic bookings)
    if (type === "clinic" && inserted?.id) {
      const { data: qp } = await (supabase as any).rpc("get_queue_position", { _appointment_id: inserted.id });
      setPatientsAhead(typeof qp === "number" ? qp : 0);
      setConfirmedApptId(inserted.id);
    }

    setToken(tkn);
    setConfirmed(true);
    setSubmitting(false);
  };

  const reset = () => {
    setStep(1); setType("clinic"); setSelectedService(null); setSelectedDate(null);
    setSelectedTime(""); setName(""); setPhone(""); setEmail(""); setAge(""); setGender(""); setComplaint("");
    setConfirmed(false); setToken(""); setPatientsAhead(null); setConfirmedApptId(null);
  };

  const downloadSlip = async () => {
    if (!selectedDate || !selectedService) return;

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const PAGE_W = 595;
    const PAGE_H = 842;

    // Colors
    const TEAL: [number, number, number] = [15, 110, 124];      // deep teal panel
    const TEAL_DARK: [number, number, number] = [10, 78, 88];
    const INK: [number, number, number] = [17, 44, 56];         // heading ink
    const MUTED: [number, number, number] = [110, 120, 128];
    const RULE: [number, number, number] = [223, 231, 235];
    const SUCCESS: [number, number, number] = [22, 163, 74];
    const WARN: [number, number, number] = [202, 138, 4];
    const DANGER: [number, number, number] = [220, 38, 38];

    // ---- Left teal panel with curved right edge ----
    doc.setFillColor(...TEAL);
    doc.rect(0, 0, 230, PAGE_H, "F");
    // curve illusion: large white ellipse overlapping right edge of panel
    doc.setFillColor(255, 255, 255);
    doc.ellipse(430, PAGE_H / 2, 360, 520, "F");
    // faint teal accent stripe at very left
    doc.setFillColor(...TEAL_DARK);
    doc.rect(0, 0, 6, PAGE_H, "F");

    // ---- Left panel content: logo + clinic name ----
    const clinicName = (profile as any)?.clinic_name || `Dr. ${profile?.full_name || ""} Clinic`;
    const tagline = (profile as any)?.tagline || "Care You Can Trust";

    // Logo circle
    doc.setFillColor(255, 255, 255);
    doc.circle(48, 60, 16, "F");
    doc.setDrawColor(...TEAL);
    doc.setLineWidth(1.2);
    // small plus mark
    doc.setFillColor(...TEAL);
    doc.rect(45, 52, 6, 16, "F");
    doc.rect(40, 57, 16, 6, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(clinicName.toUpperCase().slice(0, 20), 76, 58);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(220, 240, 245);
    doc.text(tagline, 76, 74, { maxWidth: 140 });

    // Bottom contact block (white text on teal)
    const contactY = PAGE_H - 170;
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    const clinicAddr = (profile as any)?.clinic_address || (profile as any)?.address || (profile as any)?.city || "";
    const clinicPhone = (profile as any)?.clinic_phone || (profile as any)?.phone || "";
    const clinicEmail = (profile as any)?.clinic_email || (profile as any)?.email || "";
    const publicOrigin = typeof window !== "undefined" ? window.location.origin : "";
    const doctorUrl = profile?.slug ? `${publicOrigin}/dr/${profile.slug}` : publicOrigin;
    const website = doctorUrl.replace(/^https?:\/\//, "");

    const contactRows: Array<[string, string]> = [];
    if (clinicAddr) contactRows.push(["◉", String(clinicAddr)]);
    if (clinicPhone) contactRows.push(["☏", String(clinicPhone)]);
    if (clinicEmail) contactRows.push(["✉", String(clinicEmail)]);
    contactRows.push(["⌘", website]);

    let cy = contactY;
    contactRows.forEach(([icon, val]) => {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(180, 220, 228);
      doc.text(icon, 24, cy);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(255, 255, 255);
      const lines = doc.splitTextToSize(val, 160);
      doc.text(lines, 40, cy);
      cy += 14 + (lines.length - 1) * 11;
    });

    // ================= RIGHT SIDE =================
    const R_X = 260;    // right content start
    const R_W = PAGE_W - R_X - 40;

    // Top emblem (small clipboard-check circle)
    const emblemCx = R_X + R_W / 2;
    doc.setDrawColor(...TEAL);
    doc.setLineWidth(1.5);
    doc.circle(emblemCx, 78, 22, "S");
    doc.setFillColor(...TEAL);
    // simple check tick inside
    doc.setLineWidth(2.5);
    doc.line(emblemCx - 8, 78, emblemCx - 2, 84);
    doc.line(emblemCx - 2, 84, emblemCx + 9, 72);

    // Heading
    doc.setTextColor(...TEAL_DARK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("APPOINTMENT SLIP", emblemCx, 128, { align: "center" });

    // heartbeat line under heading
    doc.setDrawColor(...TEAL);
    doc.setLineWidth(1);
    const hbY = 142;
    doc.line(R_X + 30, hbY, emblemCx - 30, hbY);
    doc.line(emblemCx - 30, hbY, emblemCx - 22, hbY - 5);
    doc.line(emblemCx - 22, hbY - 5, emblemCx - 14, hbY + 8);
    doc.line(emblemCx - 14, hbY + 8, emblemCx - 6, hbY - 10);
    doc.line(emblemCx - 6, hbY - 10, emblemCx + 2, hbY + 6);
    doc.line(emblemCx + 2, hbY + 6, emblemCx + 10, hbY);
    doc.line(emblemCx + 10, hbY, R_X + R_W - 30, hbY);

    // Token box
    const tokenBoxW = 220;
    const tokenBoxH = 70;
    const tokenX = emblemCx - tokenBoxW / 2;
    const tokenY = 168;
    doc.setDrawColor(...TEAL);
    doc.setLineWidth(1.2);
    doc.roundedRect(tokenX, tokenY, tokenBoxW, tokenBoxH, 8, 8, "S");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text("TOKEN", emblemCx, tokenY + 20, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(30);
    doc.setTextColor(...TEAL_DARK);
    doc.text(`#${token}`, emblemCx, tokenY + 52, { align: "center" });

    // ---- Detail rows ----
    const rows: Array<[string, string]> = [
      ["Doctor", `Dr. ${profile?.full_name || ""}`],
      ["Clinic", clinicName],
      ["Service", selectedService.name],
      ["Type", type === "clinic" ? "Clinic Visit" : "Online Consultation"],
      ["Date", format(selectedDate, "EEEE, d MMMM yyyy")],
      ["Time", selectedTime],
      ["Patient", name],
      ["Phone", phone],
      ["Amount", `Rs. ${selectedService.price}`],
    ];

    let ry = tokenY + tokenBoxH + 28;
    const labelX = R_X + 20;
    const valueX = R_X + 110;
    const rowH = 26;

    rows.forEach(([k, v]) => {
      // bullet
      doc.setFillColor(...TEAL);
      doc.circle(R_X + 8, ry - 4, 2.2, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(...MUTED);
      doc.text(k, labelX, ry);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...INK);
      doc.text(String(v), valueX, ry, { maxWidth: R_W - 110 });
      // separator line
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.5);
      doc.line(R_X + 4, ry + 8, R_X + R_W - 4, ry + 8);
      ry += rowH;
    });

    // Status row (colored)
    const statusLabel = settings?.auto_confirm ? "Confirmed" : "Pending";
    const statusColor: [number, number, number] = settings?.auto_confirm ? SUCCESS : WARN;
    doc.setFillColor(...TEAL);
    doc.circle(R_X + 8, ry - 4, 2.2, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...MUTED);
    doc.text("Status", labelX, ry);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...statusColor);
    doc.text(statusLabel, valueX, ry);
    // status pill circle check
    doc.setFillColor(...statusColor);
    doc.circle(valueX + doc.getTextWidth(statusLabel) + 12, ry - 4, 6, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.text(settings?.auto_confirm ? "✓" : "!", valueX + doc.getTextWidth(statusLabel) + 12, ry - 1, { align: "center" });
    doc.setDrawColor(...RULE);
    doc.line(R_X + 4, ry + 8, R_X + R_W - 4, ry + 8);
    ry += rowH + 8;

    // ---- Instruction + QR row ----
    const infoBoxY = ry + 6;
    const infoBoxH = 110;
    const qrSize = 92;
    const qrX = R_X + R_W - qrSize - 12;
    const infoBoxW = qrX - R_X - 16;

    // Instruction box
    doc.setDrawColor(...TEAL);
    doc.setLineWidth(0.8);
    doc.roundedRect(R_X, infoBoxY, infoBoxW, infoBoxH, 8, 8, "S");
    // bell mark
    doc.setFillColor(...TEAL);
    doc.circle(R_X + 20, infoBoxY + 22, 3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...TEAL_DARK);
    doc.text("PLEASE ARRIVE 10 MINUTES EARLY", R_X + 32, infoBoxY + 25);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    const noteLines = doc.splitTextToSize(
      "Carry a valid ID proof and any previous medical documents / prescriptions relevant to your visit.",
      infoBoxW - 24
    );
    doc.text(noteLines, R_X + 12, infoBoxY + 46);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`Appointment ID: ${confirmedApptId || "—"}`, R_X + 12, infoBoxY + infoBoxH - 12);

    // ---- QR code (dynamic doctor URL) ----
    try {
      const qrDataUrl = await QRCode.toDataURL(doctorUrl, {
        margin: 1,
        width: 400,
        color: { dark: "#0A4E58", light: "#FFFFFF" },
      });
      doc.addImage(qrDataUrl, "PNG", qrX, infoBoxY, qrSize, qrSize);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...TEAL_DARK);
      doc.text("Scan to Visit", qrX + qrSize / 2, infoBoxY + qrSize + 12, { align: "center" });
      doc.text("Doctor's Website", qrX + qrSize / 2, infoBoxY + qrSize + 22, { align: "center" });
    } catch {
      // if QR fails silently, keep slip usable
    }

    // ---- Thank you footer ----
    doc.setFont("times", "italic");
    doc.setFontSize(24);
    doc.setTextColor(...TEAL_DARK);
    doc.text("Thank You!", emblemCx, PAGE_H - 60, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text("We wish you good health.", emblemCx, PAGE_H - 42, { align: "center" });

    doc.save(`appointment-${token}.pdf`);
  };


  const initiateRazorpayPayment = () => {
    toast.info("Payment gateway integration coming soon", {
      description: "Your booking will be created as Pay at Clinic for now.",
    });
    submitBooking();
  };

  const gatewayConnected = Boolean((settings as any)?.razorpay_key_id);
  const wantsOnlinePayment = Boolean(settings?.require_payment);

  const estWaitMinutes = (patientsAhead ?? 0) * (selectedService?.duration || 15);

  if (confirmed) {
    return (
      <section id="booking" className="py-16 md:py-24 bg-cloud-blue">
        <div className="container mx-auto px-4 max-w-lg">
          <div className="bg-card rounded-2xl shadow-xl p-8 text-center">
            <CheckCircle2 size={64} className="text-success mx-auto mb-4" />
            <h3 className="font-heading font-bold text-2xl text-primary mb-2">
              Appointment {settings?.auto_confirm ? "Confirmed" : "Requested"}!
            </h3>
            <p className="text-text-gray mb-4">Token #{token}</p>
            <div className="bg-secondary rounded-xl p-4 text-left space-y-2 text-sm mb-4">
              <p><strong>Doctor:</strong> Dr. {profile?.full_name}</p>
              <p><strong>Service:</strong> {selectedService?.name}</p>
              <p><strong>Type:</strong> {type === "clinic" ? "Clinic Visit" : "Online"}</p>
              <p><strong>Date:</strong> {selectedDate && format(selectedDate, "EEEE, d MMMM")}</p>
              <p><strong>Time:</strong> {selectedTime}</p>
              <p><strong>Patient:</strong> {name}</p>
            </div>

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
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={downloadSlip} className="gap-1.5"><Download className="h-4 w-4" /> Download Slip</Button>
              <Button variant="outline" onClick={reset}>Book Another</Button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="booking" className="py-16 md:py-24 bg-cloud-blue">
      <div className="container mx-auto px-4 max-w-2xl">
        <h2 className="font-heading font-bold text-3xl md:text-4xl text-primary text-center mb-2">Book an Appointment</h2>
        <p className="text-text-gray text-center mb-4">Select your preference and book in under 2 minutes</p>
        {profile?.slug && (
          <p className="text-center text-sm mb-6">
            <a href={`/dr/${profile.slug}/manage`} className="text-royal hover:underline">
              Already booked? Manage your appointment →
            </a>
          </p>
        )}

        <div className="bg-card rounded-2xl shadow-xl p-6 md:p-8">
          <div className="flex gap-1 mb-6">
            {[1, 2, 3, 4, 5].map((s) => (
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
              <div className="grid grid-cols-2 gap-4">
                {[{ k: "clinic" as const, label: "🏥 Clinic Visit" }, { k: "online" as const, label: "💻 Online" }].map((t) => (
                  <button key={t.k} onClick={() => { setType(t.k); setStep(2); }}
                    className={`p-6 rounded-xl border-2 font-heading font-semibold text-lg transition-all ${type === t.k ? "border-royal bg-royal/5 text-royal" : "border-border text-foreground hover:border-royal/50"}`}>
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
                    <span className="font-heading font-bold text-primary">₹{s.price}</span>
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
                  <input type="number" placeholder="Age" value={age} onChange={(e) => setAge(e.target.value)}
                    className="px-4 py-3 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-royal" />
                  <select value={gender} onChange={(e) => setGender(e.target.value)}
                    className="px-4 py-3 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-royal">
                    <option value="">Gender</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
                  </select>
                </div>
                <textarea placeholder="Chief complaint / Reason for visit (optional)" rows={2} value={complaint} onChange={(e) => setComplaint(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-royal resize-none" />
              </div>

              <div className="bg-secondary rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-text-gray">Service</span><span className="text-foreground font-medium">{selectedService?.name}</span></div>
                <div className="flex justify-between"><span className="text-text-gray">Date</span><span className="text-foreground font-medium">{selectedDate && format(selectedDate, "d MMM")}</span></div>
                <div className="flex justify-between"><span className="text-text-gray">Time</span><span className="text-foreground font-medium">{selectedTime}</span></div>
                <hr className="border-border" />
                <div className="flex justify-between font-heading font-bold text-lg"><span>Total</span><span className="text-primary">₹{selectedService?.price}</span></div>
              </div>

              {wantsOnlinePayment && !gatewayConnected && (
                <div className="p-3 rounded-xl bg-warning/10 border border-warning/20 text-sm text-warning-foreground/80 flex items-start gap-2">
                  <CreditCard className="h-4 w-4 mt-0.5 shrink-0 text-warning" />
                  <span>Online payment is not active yet for this clinic — you'll pay at the clinic instead.</span>
                </div>
              )}

              {wantsOnlinePayment && gatewayConnected ? (
                <Button className="w-full gradient-hero text-primary-foreground font-heading font-semibold text-lg py-6"
                  disabled={!name || !phone || submitting} onClick={initiateRazorpayPayment}>
                  {submitting ? "Processing..." : `Pay ₹${selectedService?.price} Online`}
                </Button>
              ) : (
                <Button className="w-full gradient-hero text-primary-foreground font-heading font-semibold text-lg py-6"
                  disabled={!name || !phone || submitting} onClick={submitBooking}>
                  {submitting ? "Booking..." : `Book Appointment — ₹${selectedService?.price}`}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default BookingWidget;
