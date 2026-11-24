import { useMemo, useState } from "react";
import { CalendarCheck2, CheckCircle2, Clock, Lock } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormattedPhoneInput } from "@/components/ui/formatted-phone-input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { isValidIndianPhone, phoneErrorMessage } from "@/lib/phone";
import { demoDays, demoSlotsFor, formatDemoTime } from "@/lib/demoSlots";
// The same calendar and hour / minute / AM-PM picker patients use to book a doctor.
import DatePicker from "@/components/doctor/booking/DatePicker";
import TimePicker from "@/components/doctor/booking/TimePicker";
import "@/styles/doctor-site.css";

const demoSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Invalid email address").max(255),
  phone: z.string().trim().min(1, "Phone number is required").refine(isValidIndianPhone, phoneErrorMessage),
  clinic_name: z.string().trim().max(100).optional(),
  city: z.string().trim().max(50).optional(),
  message: z.string().trim().max(1000).optional(),
});

const EMPTY = { name: "", email: "", phone: "", clinic_name: "", city: "", message: "" };

/** "Wed 25 Nov, 2:07 PM" for the button. */
const shortLabel = (day: Date, time: string) => {
  const [h, m] = time.split(":").map(Number);
  return `${day.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}, ${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

/**
 * Book a product demo: a date from the calendar and any start time from 10 AM to 7 PM IST
 * (to the minute), then the contact details. Saved as an enquiry, which the team confirms.
 */
const DemoBookingForm = () => {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState("");

  // The earliest free time is chosen up front, so most people only fill in their details.
  const days = useMemo(() => demoDays(), []);
  const [date, setDate] = useState<Date | null>(() => days[0] ?? null);
  const slots = useMemo(() => (date ? demoSlotsFor(date) : []), [date]);
  const [time, setTime] = useState(() => (days[0] ? demoSlotsFor(days[0])[0] ?? "" : ""));
  const chosen = date && time ? formatDemoTime(date, time) : "";

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fieldErrors: Record<string, string> = {};
    const result = demoSchema.safeParse(form);
    if (!result.success) {
      result.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
    }
    if (!chosen) fieldErrors.when = "Choose a date and time for your demo.";
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) return;

    setLoading(true);
    // Same table and format as the Contact page's demo enquiries, so the team sees them together.
    const body = form.message.trim();
    const { error } = await supabase.from("enquiries").insert([
      {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        clinic_name: form.clinic_name.trim() || null,
        city: form.city.trim() || null,
        message: `[Topic: Book a demo]\n[Preferred demo time: ${chosen}]${body ? `\n${body}` : ""}`,
      },
    ]);
    setLoading(false);
    if (error) {
      toast({ title: "Demo not booked", description: "Could not send your request. Please try again.", variant: "destructive" });
      return;
    }
    setSent(chosen);
    toast({ title: "Demo requested!", description: `We'll confirm ${chosen} by phone or email.` });
  };

  if (sent) {
    return (
      <div role="status" className="flex min-h-[420px] flex-col items-center justify-center rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
          <CheckCircle2 className="h-9 w-9 text-success" aria-hidden="true" />
        </span>
        <h2 className="mt-5 font-heading text-2xl font-bold text-navy">Your demo is requested</h2>
        <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-semibold text-primary">
          <CalendarCheck2 className="h-4 w-4" aria-hidden="true" /> {sent}
        </p>
        <p className="mt-3 max-w-sm text-sm text-muted-foreground md:text-base">
          Our team will confirm this time by phone or email and send you the call details.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-6"
          onClick={() => {
            setForm(EMPTY);
            setSent("");
          }}
        >
          Book another demo
        </Button>
      </div>
    );
  }

  const fieldError = (key: string) =>
    errors[key] ? (
      <p id={`demo-${key}-error`} role="alert" className="mt-1 text-xs text-destructive">
        {errors[key]}
      </p>
    ) : null;
  const invalid = (key: string) => (errors[key] ? { "aria-invalid": true, "aria-describedby": `demo-${key}-error` } : {});

  return (
    <form id="demo-form" onSubmit={handleSubmit} noValidate className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-8">
      {/* 1. When */}
      <fieldset>
        <legend className="flex items-center gap-2.5 font-heading text-lg font-bold text-navy">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
          Pick a date and time
        </legend>
        <p className="mt-1.5 text-sm text-muted-foreground">Any time from 10:00 AM to 7:00 PM (IST), Monday to Saturday.</p>

        {/* The pickers carry the doctor-site look; this wrapper supplies their tokens. */}
        <div className="doctor-site mt-4 grid gap-4 !bg-transparent sm:grid-cols-2">
          <div>
            {/* Plain captions, not <label>: a label would replace the field's spoken value ("Wed, 25 Nov 2026"). */}
            <p className="mb-1.5 text-sm font-medium leading-none text-foreground">Date</p>
            <DatePicker
              id="demo-date"
              value={date}
              fromDate={days[0] ?? new Date()}
              toDate={days[days.length - 1] ?? new Date()}
              isAvailable={(d) => days.some((day) => day.toDateString() === d.toDateString())}
              disabled={days.length === 0}
              onChange={(d) => {
                setDate(d);
                // Keep the same clock time on the new day when it is still possible there.
                const next = demoSlotsFor(d);
                setTime(next.includes(time) ? time : next[0] ?? "");
                setErrors((x) => ({ ...x, when: "" }));
              }}
            />
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium leading-none text-foreground">Time (IST)</p>
            <TimePicker
              id="demo-time"
              slots={slots}
              value={time}
              disabled={!date}
              emptyLabel={date ? "No times left" : "Choose a date first"}
              onChange={(t) => {
                setTime(t);
                setErrors((x) => ({ ...x, when: "" }));
              }}
            />
          </div>
        </div>
        {fieldError("when")}
      </fieldset>

      {/* 2. Who */}
      <fieldset className="mt-8 border-t border-border pt-7">
        <legend className="flex items-center gap-2.5 font-heading text-lg font-bold text-navy">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
          Your details
        </legend>

        <div className="mt-4 space-y-4 md:space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="demo-name">Full Name *</Label>
              <Input id="demo-name" autoComplete="name" placeholder="Dr. Rahul Sharma" value={form.name} onChange={set("name")} className={`mt-1.5 h-11 ${errors.name ? "border-destructive" : ""}`} {...invalid("name")} />
              {fieldError("name")}
            </div>
            <div>
              <Label htmlFor="demo-email">Email *</Label>
              <Input id="demo-email" type="email" autoComplete="email" placeholder="doctor@gmail.com" value={form.email} onChange={set("email")} className={`mt-1.5 h-11 ${errors.email ? "border-destructive" : ""}`} {...invalid("email")} />
              {fieldError("email")}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="demo-phone">Phone *</Label>
              <FormattedPhoneInput id="demo-phone" autoComplete="tel" placeholder="+91 98765 43210" value={form.phone} onChange={set("phone")} className={`mt-1.5 h-11 ${errors.phone ? "border-destructive" : ""}`} {...invalid("phone")} />
              {fieldError("phone")}
            </div>
            <div>
              <Label htmlFor="demo-clinic">Clinic</Label>
              <Input id="demo-clinic" autoComplete="organization" placeholder="Your clinic name" value={form.clinic_name} onChange={set("clinic_name")} className="mt-1.5 h-11" />
            </div>
          </div>

          <div>
            <Label htmlFor="demo-city">City</Label>
            <Input id="demo-city" autoComplete="address-level2" placeholder="Mumbai" value={form.city} onChange={set("city")} className="mt-1.5 h-11" />
          </div>

          <div>
            <Label htmlFor="demo-message">Anything we should cover? (optional)</Label>
            <Textarea id="demo-message" rows={3} maxLength={1000} placeholder="Your specialty, number of doctors, features you want to see..." value={form.message} onChange={set("message")} className="mt-1.5" />
          </div>
        </div>
      </fieldset>

      <Button type="submit" disabled={loading} size="lg" className="mt-7 w-full gap-2 bg-royal text-white hover:bg-royal/90">
        <Clock className="h-4 w-4" aria-hidden="true" />
        {loading ? "Booking..." : date && time ? `Book demo · ${shortLabel(date, time)}` : "Book demo"}
      </Button>
      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> We only use your details to arrange this demo.
      </p>
    </form>
  );
};

export default DemoBookingForm;
