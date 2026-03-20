import { useState } from "react";
import { CheckCircle2, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDoctorData } from "@/contexts/DoctorContext";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays } from "date-fns";

const getNextDays = (count: number) => {
  const days = [];
  const today = new Date();
  for (let i = 0; i < count; i++) {
    days.push(addDays(today, i));
  }
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
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [complaint, setComplaint] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [token, setToken] = useState("");

  const advanceDays = settings?.booking_advance_days || 7;
  const days = getNextDays(advanceDays);

  const dayOfWeek = selectedDate ? selectedDate.getDay() : -1;
  const wh = workingHours.find((h) => h.day_of_week === dayOfWeek);

  const timeSlots = wh?.is_open
    ? [...generateTimeSlots(wh.start_time, wh.end_time), ...generateTimeSlots(wh.start_time_2, wh.end_time_2)]
    : [];

  const availableServices = services.filter((s) =>
    type === "online" ? s.type === "online" || s.type === "both" : s.type === "clinic" || s.type === "both"
  );

  const submitBooking = async () => {
    if (!profile || !selectedService || !selectedDate || !selectedTime || !name || !phone) return;
    setSubmitting(true);
    const tkn = `T${Math.floor(Math.random() * 999) + 1}`;
    const dateStr = format(selectedDate, "yyyy-MM-dd");

    await supabase.from("appointments").insert({
      doctor_id: profile.id,
      patient_name: name,
      patient_phone: phone,
      patient_age: age ? Number(age) : null,
      patient_gender: gender || null,
      service_name: selectedService.name,
      appointment_type: type,
      date: dateStr,
      time_slot: selectedTime,
      amount: selectedService.price,
      token_number: tkn,
      chief_complaint: complaint || null,
      status: (settings?.auto_confirm ? "confirmed" : "pending") as any,
      payment_status: "pay_at_clinic" as any,
    });

    // Upsert patient
    const { data: existing } = await supabase.from("patients").select("id, total_visits").eq("doctor_id", profile.id).eq("phone", phone).single();
    if (existing) {
      await supabase.from("patients").update({ total_visits: (existing.total_visits || 0) + 1, last_visit: dateStr }).eq("id", existing.id);
    } else {
      await supabase.from("patients").insert({
        doctor_id: profile.id, name, phone, age: age ? Number(age) : null,
        gender: gender || null, first_visit: dateStr, last_visit: dateStr, total_visits: 1,
      });
    }

    setToken(tkn);
    setConfirmed(true);
    setSubmitting(false);
  };

  const reset = () => {
    setStep(1); setType("clinic"); setSelectedService(null); setSelectedDate(null);
    setSelectedTime(""); setName(""); setPhone(""); setAge(""); setGender(""); setComplaint("");
    setConfirmed(false); setToken("");
  };

  if (confirmed) {
    return (
      <section id="booking" className="py-16 md:py-24 bg-cloud-blue">
        <div className="container mx-auto px-4 max-w-lg">
          <div className="bg-card rounded-2xl shadow-xl p-8 text-center">
            <CheckCircle2 size={64} className="text-success mx-auto mb-4" />
            <h3 className="font-heading font-bold text-2xl text-primary mb-2">Appointment {settings?.auto_confirm ? "Confirmed" : "Requested"}!</h3>
            <p className="text-text-gray mb-4">Token #{token}</p>
            <div className="bg-secondary rounded-xl p-4 text-left space-y-2 text-sm mb-6">
              <p><strong>Doctor:</strong> Dr. {profile?.full_name}</p>
              <p><strong>Service:</strong> {selectedService?.name}</p>
              <p><strong>Type:</strong> {type === "clinic" ? "Clinic Visit" : "Online"}</p>
              <p><strong>Date:</strong> {selectedDate && format(selectedDate, "EEEE, d MMMM")}</p>
              <p><strong>Time:</strong> {selectedTime}</p>
              <p><strong>Patient:</strong> {name}</p>
            </div>
            <Button variant="outline" onClick={reset}>Book Another Appointment</Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="booking" className="py-16 md:py-24 bg-cloud-blue">
      <div className="container mx-auto px-4 max-w-2xl">
        <h2 className="font-heading font-bold text-3xl md:text-4xl text-primary text-center mb-2">Book an Appointment</h2>
        <p className="text-text-gray text-center mb-8">Select your preference and book in under 2 minutes</p>

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

          {/* Step 1: Type */}
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

          {/* Step 2: Service */}
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

          {/* Step 3: Date */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="font-heading font-semibold text-lg text-foreground">Select Date</h3>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {days.map((d, i) => {
                  const dow = d.getDay();
                  const wh = workingHours.find((h) => h.day_of_week === dow);
                  const closed = !wh?.is_open;
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

          {/* Step 4: Time */}
          {step === 4 && (
            <div className="space-y-4">
              <h3 className="font-heading font-semibold text-lg text-foreground">Select Time Slot</h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {timeSlots.map((t) => (
                  <button key={t} onClick={() => { setSelectedTime(t); setStep(5); }}
                    className={`py-3 rounded-lg border-2 text-sm font-medium transition-all ${selectedTime === t ? "border-royal bg-royal text-primary-foreground" : "border-border text-foreground hover:border-royal"}`}>
                    {t}
                  </button>
                ))}
                {timeSlots.length === 0 && <p className="text-muted-foreground text-sm col-span-full">No slots available for this date.</p>}
              </div>
            </div>
          )}

          {/* Step 5: Patient details + Submit */}
          {step === 5 && (
            <div className="space-y-4">
              <h3 className="font-heading font-semibold text-lg text-foreground">Patient Details</h3>
              <div className="space-y-3">
                <input type="text" placeholder="Full Name *" value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-royal" />
                <div className="flex items-center gap-2">
                  <span className="px-3 py-3 rounded-lg border border-border bg-secondary text-sm text-foreground">+91</span>
                  <input type="tel" placeholder="Mobile Number *" value={phone} onChange={(e) => setPhone(e.target.value)}
                    className="flex-1 px-4 py-3 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-royal" />
                </div>
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

              <Button className="w-full gradient-hero text-primary-foreground font-heading font-semibold text-lg py-6"
                disabled={!name || !phone || submitting} onClick={submitBooking}>
                {submitting ? "Booking..." : `Book Appointment — ₹${selectedService?.price}`}
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default BookingWidget;
