import { useState } from "react";
import { Calendar, Clock, User, CheckCircle2, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const services = [
  { name: "General Consultation", price: 500 },
  { name: "Cardiac Consultation", price: 800 },
  { name: "ECG Interpretation", price: 300 },
  { name: "Echo Cardiogram", price: 1200 },
  { name: "Online Consultation", price: 600 },
];

const timeSlots = ["9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM", "12:00 PM", "12:30 PM", "5:00 PM", "5:30 PM", "6:00 PM", "6:30 PM", "7:00 PM", "7:30 PM"];
const bookedSlots = ["10:00 AM", "11:30 AM", "6:00 PM"];

const getNextDays = () => {
  const days = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push({ date: d, full: i === 3 });
  }
  return days;
};

const BookingWidget = () => {
  const [step, setStep] = useState(1);
  const [type, setType] = useState<"clinic" | "online">("clinic");
  const [service, setService] = useState("");
  const [selectedDate, setSelectedDate] = useState<number | null>(null);
  const [selectedTime, setSelectedTime] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const days = getNextDays();
  const selectedService = services.find(s => s.name === service);

  const reset = () => { setStep(1); setType("clinic"); setService(""); setSelectedDate(null); setSelectedTime(""); setName(""); setPhone(""); };

  if (step === 7) {
    return (
      <section id="booking" className="py-16 md:py-24 bg-cloud-blue">
        <div className="container mx-auto px-4 max-w-lg">
          <div className="bg-card rounded-2xl shadow-xl p-8 text-center">
            <CheckCircle2 size={64} className="text-success mx-auto mb-4" />
            <h3 className="font-heading font-bold text-2xl text-primary mb-2">Appointment Confirmed!</h3>
            <p className="text-text-gray mb-4">Token #A7</p>
            <div className="bg-secondary rounded-xl p-4 text-left space-y-2 text-sm mb-6">
              <p><strong>Doctor:</strong> Dr. Rahul Sharma</p>
              <p><strong>Service:</strong> {service}</p>
              <p><strong>Type:</strong> {type === "clinic" ? "Clinic Visit" : "Online"}</p>
              <p><strong>Date:</strong> {selectedDate !== null && days[selectedDate].date.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</p>
              <p><strong>Time:</strong> {selectedTime}</p>
              <p><strong>Patient:</strong> {name}</p>
            </div>
            <p className="text-sm text-success mb-4">✓ WhatsApp confirmation sent to +91 {phone}</p>
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
          {/* Progress */}
          <div className="flex gap-1 mb-6">
            {[1, 2, 3, 4, 5, 6].map(s => (
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
                {[{ k: "clinic" as const, label: "🏥 Clinic Visit" }, { k: "online" as const, label: "💻 Online" }].map(t => (
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
                {services.filter(s => type === "online" ? s.name.includes("Online") || s.name.includes("General") || s.name.includes("Cardiac") : !s.name.includes("Online")).map(s => (
                  <button key={s.name} onClick={() => { setService(s.name); setStep(3); }}
                    className={`w-full p-4 rounded-xl border-2 text-left flex justify-between items-center transition-all ${service === s.name ? "border-royal bg-royal/5" : "border-border hover:border-royal/50"}`}>
                    <span className="font-medium text-foreground">{s.name}</span>
                    <span className="font-heading font-bold text-primary">₹{s.price}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Date */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="font-heading font-semibold text-lg text-foreground">Select Date</h3>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {days.map((d, i) => (
                  <button key={i} disabled={d.full} onClick={() => { setSelectedDate(i); setStep(4); }}
                    className={`flex-shrink-0 w-20 py-3 rounded-xl border-2 text-center transition-all ${d.full ? "opacity-40 cursor-not-allowed border-border" : selectedDate === i ? "border-royal bg-royal/5" : "border-border hover:border-royal/50"}`}>
                    <p className="text-xs text-text-gray">{d.date.toLocaleDateString("en-IN", { weekday: "short" })}</p>
                    <p className="font-heading font-bold text-lg text-foreground">{d.date.getDate()}</p>
                    <p className="text-xs text-text-gray">{d.date.toLocaleDateString("en-IN", { month: "short" })}</p>
                    {d.full && <p className="text-[10px] text-destructive mt-1">Full</p>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: Time */}
          {step === 4 && (
            <div className="space-y-4">
              <h3 className="font-heading font-semibold text-lg text-foreground">Select Time Slot</h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {timeSlots.map(t => {
                  const booked = bookedSlots.includes(t);
                  return (
                    <button key={t} disabled={booked} onClick={() => { setSelectedTime(t); setStep(5); }}
                      className={`py-3 rounded-lg border-2 text-sm font-medium transition-all ${booked ? "opacity-40 cursor-not-allowed border-border bg-muted text-text-gray" : selectedTime === t ? "border-royal bg-royal text-primary-foreground" : "border-border text-foreground hover:border-royal"}`}>
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 5: Patient details */}
          {step === 5 && (
            <div className="space-y-4">
              <h3 className="font-heading font-semibold text-lg text-foreground">Patient Details</h3>
              <div className="space-y-3">
                <input type="text" placeholder="Full Name *" value={name} onChange={e => setName(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-royal" />
                <div className="flex items-center gap-2">
                  <span className="px-3 py-3 rounded-lg border border-border bg-secondary text-sm text-foreground">+91</span>
                  <input type="tel" placeholder="Mobile Number *" value={phone} onChange={e => setPhone(e.target.value)}
                    className="flex-1 px-4 py-3 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-royal" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" placeholder="Age" className="px-4 py-3 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-royal" />
                  <select className="px-4 py-3 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-royal">
                    <option value="">Gender</option><option>Male</option><option>Female</option><option>Other</option>
                  </select>
                </div>
                <textarea placeholder="Chief complaint / Reason for visit (optional)" rows={2}
                  className="w-full px-4 py-3 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-royal resize-none" />
              </div>
              <Button className="w-full bg-primary text-primary-foreground font-heading font-semibold" disabled={!name || !phone} onClick={() => setStep(6)}>
                Continue to Payment
              </Button>
            </div>
          )}

          {/* Step 6: Payment */}
          {step === 6 && (
            <div className="space-y-4">
              <h3 className="font-heading font-semibold text-lg text-foreground">Payment</h3>
              <div className="bg-secondary rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-text-gray">Service</span><span className="text-foreground font-medium">{service}</span></div>
                <div className="flex justify-between"><span className="text-text-gray">Date</span><span className="text-foreground font-medium">{selectedDate !== null && days[selectedDate].date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span></div>
                <div className="flex justify-between"><span className="text-text-gray">Time</span><span className="text-foreground font-medium">{selectedTime}</span></div>
                <hr className="border-border" />
                <div className="flex justify-between font-heading font-bold text-lg"><span>Total</span><span className="text-primary">₹{selectedService?.price}</span></div>
              </div>
              <Button className="w-full gradient-hero text-primary-foreground font-heading font-semibold text-lg py-6" onClick={() => setStep(7)}>
                Pay ₹{selectedService?.price} Online
              </Button>
              <button onClick={() => setStep(7)} className="w-full text-center text-sm text-royal hover:underline">Pay at Clinic instead</button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default BookingWidget;
