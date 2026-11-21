import { useEffect, useState } from "react";
import { CheckCircle2, Lock, Send } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormattedPhoneInput } from "@/components/ui/formatted-phone-input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { isValidIndianPhone, phoneErrorMessage } from "@/lib/phone";
import { CONTACT_TOPICS, type ContactTopic } from "./contactTopics";

const enquirySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Invalid email address").max(255),
  phone: z.string().trim().min(1, "Phone number is required").refine(isValidIndianPhone, phoneErrorMessage),
  clinic_name: z.string().trim().max(100).optional(),
  city: z.string().trim().max(50).optional(),
  message: z.string().trim().max(1000).optional(),
});

const EMPTY = { name: "", email: "", phone: "", clinic_name: "", city: "", message: "" };

const ContactEnquiryForm = ({ initialTopic = "demo" }: { initialTopic?: ContactTopic }) => {
  const [form, setForm] = useState(EMPTY);
  const [topic, setTopic] = useState<ContactTopic>(initialTopic);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // A "Book a live demo" card elsewhere on the page can change the topic from outside.
  useEffect(() => {
    setTopic(initialTopic);
  }, [initialTopic]);

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    const result = enquirySchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }
    setLoading(true);
    // The enquiries table has no topic column, so the topic travels at the top of the message.
    const topicLabel = CONTACT_TOPICS.find((t) => t.value === topic)?.label ?? "";
    const body = form.message.trim();
    const { error } = await supabase.from("enquiries").insert([
      {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        clinic_name: form.clinic_name.trim() || null,
        city: form.city.trim() || null,
        message: `[Topic: ${topicLabel}]${body ? `\n${body}` : ""}`,
      },
    ]);
    setLoading(false);
    if (error) {
      toast({ title: "Error", description: "Could not submit. Please try again.", variant: "destructive" });
      return;
    }
    setSubmitted(true);
    toast({ title: "Enquiry Submitted!", description: "We'll get back to you within 24 hours." });
  };

  if (submitted) {
    return (
      <div
        role="status"
        className="flex h-full min-h-[360px] flex-col items-center justify-center rounded-3xl border border-border bg-card p-8 text-center shadow-sm"
      >
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
          <CheckCircle2 className="h-9 w-9 text-success" aria-hidden="true" />
        </span>
        <h2 className="mt-5 font-heading text-2xl font-bold text-navy">Thank you!</h2>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground md:text-base">
          Your enquiry has been submitted. Our team will contact you within 24 hours.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-6"
          onClick={() => {
            setForm(EMPTY);
            setSubmitted(false);
          }}
        >
          Send another enquiry
        </Button>
      </div>
    );
  }

  const fieldError = (key: string) =>
    errors[key] ? (
      <p id={`${key}-error`} className="mt-1 text-xs text-destructive">
        {errors[key]}
      </p>
    ) : null;
  const invalid = (key: string) => (errors[key] ? { "aria-invalid": true, "aria-describedby": `${key}-error` } : {});

  return (
    <form
      id="enquiry-form"
      onSubmit={handleSubmit}
      noValidate
      className="scroll-mt-28 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-8"
    >
      <span className="text-xs font-semibold uppercase tracking-wider text-primary">Send a message</span>
      <h2 className="mt-1 font-heading text-2xl font-bold text-navy md:text-3xl">Send us an enquiry</h2>
      <p className="mt-2 text-sm text-muted-foreground md:text-base">
        Tell us a little about your clinic and what you need. We'll reply within 24 hours.
      </p>

      <div className="mt-6 space-y-4 md:space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="contact-name">Full Name *</Label>
            <Input
              id="contact-name"
              autoComplete="name"
              placeholder="Dr. Rahul Sharma"
              value={form.name}
              onChange={set("name")}
              className={`mt-1.5 h-11 ${errors.name ? "border-destructive" : ""}`}
              {...invalid("name")}
            />
            {fieldError("name")}
          </div>
          <div>
            <Label htmlFor="contact-email">Email *</Label>
            <Input
              id="contact-email"
              type="email"
              autoComplete="email"
              placeholder="doctor@gmail.com"
              value={form.email}
              onChange={set("email")}
              className={`mt-1.5 h-11 ${errors.email ? "border-destructive" : ""}`}
              {...invalid("email")}
            />
            {fieldError("email")}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="contact-phone">Phone *</Label>
            <FormattedPhoneInput
              id="contact-phone"
              autoComplete="tel"
              placeholder="+91 98765 43210"
              value={form.phone}
              onChange={set("phone")}
              className={`mt-1.5 h-11 ${errors.phone ? "border-destructive" : ""}`}
              {...invalid("phone")}
            />
            {fieldError("phone")}
          </div>
          <div>
            <Label htmlFor="contact-clinic">Clinic</Label>
            <Input
              id="contact-clinic"
              autoComplete="organization"
              placeholder="Your clinic name"
              value={form.clinic_name}
              onChange={set("clinic_name")}
              className="mt-1.5 h-11"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="contact-city">City</Label>
          <Input
            id="contact-city"
            autoComplete="address-level2"
            placeholder="Mumbai"
            value={form.city}
            onChange={set("city")}
            className="mt-1.5 h-11"
          />
        </div>

        <fieldset>
          <legend className="text-sm font-medium leading-none">What do you need help with?</legend>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {CONTACT_TOPICS.map((t) => (
              <label key={t.value} className="cursor-pointer">
                <input
                  type="radio"
                  name="contact-topic"
                  value={t.value}
                  checked={topic === t.value}
                  onChange={() => setTopic(t.value)}
                  className="peer sr-only"
                />
                <span className="inline-flex min-h-10 items-center rounded-full border border-border bg-secondary px-4 text-sm font-medium text-navy transition-colors hover:bg-accent peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2">
                  {t.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <Label htmlFor="contact-message">Message</Label>
          <Textarea
            id="contact-message"
            rows={4}
            maxLength={1000}
            placeholder="Tell us about your practice and what you need..."
            value={form.message}
            onChange={set("message")}
            className="mt-1.5"
          />
        </div>

        <Button type="submit" disabled={loading} size="lg" className="w-full gap-2 bg-royal text-white hover:bg-royal/90">
          <Send className="h-4 w-4" aria-hidden="true" /> {loading ? "Submitting..." : "Send Enquiry"}
        </Button>
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> We only use your details to reply to this enquiry.
        </p>
      </div>
    </form>
  );
};

export default ContactEnquiryForm;
