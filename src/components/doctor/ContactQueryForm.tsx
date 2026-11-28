import { useState } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { DigitsInput } from "@/components/ui/digits-input";
import { useDoctorData } from "@/contexts/DoctorContext";
import { supabase } from "@/integrations/supabase/client";
import { isValidIndianPhone, normalizeIndianPhone, phoneErrorMessage } from "@/lib/phone";
import { edgeFunctionErrorMessage } from "@/lib/edgeFunctionError";
import { formatDoctorName } from "@/lib/seo/doctorSeo";
import { dsCn as cn } from "./ui/dsCn";
import DsButton from "./ui/DsButton";
import SectionHeader from "./ui/SectionHeader";

/** The red-free asterisk that marks a required field (the form is also marked `required`). */
const Req = () => (
  <span aria-hidden="true" className="ml-0.5 text-ds-danger">
    *
  </span>
);

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

type Field = "name" | "phone" | "email" | "message";

const inputClass = (invalid: boolean) =>
  cn(
    "w-full rounded-ds-sm border bg-ds-surface px-4 text-ds-body text-ds-ink outline-none transition-colors placeholder:text-ds-ink-3 focus:border-ds-accent",
    invalid ? "border-ds-danger" : "border-ds-line",
  );

/**
 * "Ask a question" (spec §5.10). Same fields, anti-spam and edge function as
 * before. Friction changes: errors show under a field when the patient leaves
 * it (not in a pop-up after submitting). Required fields carry a * (name, mobile
 * number, message); email is always on the form, above the message.
 */
const MESSAGE_LIMIT = 1000;

const ContactQueryForm = () => {
  const { profile, isTeamClinic, practitioners } = useDoctorData();
  const doctors = isTeamClinic === true ? practitioners ?? [] : [];
  // patient_queries has no doctor column (and the edge function takes none), so a chosen doctor
  // travels as the first line of the message: "For Dr. X:". A migration would be needed for a real column.
  const [doctorId, setDoctorId] = useState("");
  const chosen = doctors.find((d) => d.id === doctorId);
  const prefix = chosen ? `For ${formatDoctorName(chosen.display_name)}:\n` : "";
  const messageLimit = MESSAGE_LIMIT - prefix.length;
  const [values, setValues] = useState({ name: "", phone: "", email: "", message: "" });
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [website, setWebsite] = useState(""); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const set = (field: Field) => (value: string) => setValues((v) => ({ ...v, [field]: value }));
  const touch = (field: Field) => () => setTouched((t) => ({ ...t, [field]: true }));

  const errors: Partial<Record<Field, string>> = {
    ...(!values.name.trim() && { name: "Please enter your name." }),
    ...(!values.phone.trim()
      ? { phone: "Please enter your phone number." }
      : !isValidIndianPhone(values.phone) && { phone: phoneErrorMessage }),
    ...(values.email.trim() && !isValidEmail(values.email) && { email: "Enter a valid email address." }),
    ...(!values.message.trim() && { message: "Please write your message." }),
  };
  const shown = (field: Field) => (touched[field] ? errors[field] : undefined);

  const reset = () => {
    setValues({ name: "", phone: "", email: "", message: "" });
    setTouched({});
    setWebsite("");
    setDoctorId("");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile?.id) return;

    if (Object.keys(errors).length > 0) {
      setTouched({ name: true, phone: true, email: true, message: true });
      const first = (["name", "phone", "email", "message"] as Field[]).find((f) => errors[f]);
      if (first) document.getElementById(`query-${first}`)?.focus();
      return;
    }
    if (website.trim()) {
      // A bot filled the hidden field: pretend success, send nothing.
      setSubmitted(true);
      reset();
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.functions.invoke("submit-patient-query", {
      body: {
        doctor_id: profile.id,
        name: values.name.trim(),
        phone: normalizeIndianPhone(values.phone),
        email: values.email.trim() || null,
        message: `${prefix}${values.message.trim()}`,
      },
    });
    setSubmitting(false);

    if (error) {
      const serverMessage = await edgeFunctionErrorMessage(error, "Couldn't send your message. Please try again.");
      if (serverMessage.includes("PATIENT_QUERY_RATE_LIMITED") || serverMessage === "Too many requests") {
        toast.error("Please wait a moment before sending another message.");
      } else {
        toast.error(serverMessage);
      }
      return;
    }
    setSubmitted(true);
    reset();
  };

  const errorText = (field: Field) =>
    shown(field) ? (
      <p id={`query-${field}-error`} role="alert" className="mt-1.5 text-ds-small text-ds-danger">
        {shown(field)}
      </p>
    ) : null;

  const a11y = (field: Field) => ({
    "aria-invalid": shown(field) ? true : undefined,
    "aria-describedby": shown(field) ? `query-${field}-error` : undefined,
  });

  return (
    <section id="ask" aria-labelledby="ask-heading" className="ds-dots bg-ds-paper-2 py-[4.5rem] md:py-32">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-5 sm:px-6 lg:grid-cols-12 lg:gap-16 lg:px-8">
        <div className="lg:col-span-5">
          <SectionHeader
            id="ask-heading"
            eyebrow="Ask a question"
            title="Not sure where to start?"
            intro="Send the clinic a message and they will get back to you on the number you give. For an emergency, call your local emergency number instead."
          />
          <p className="mt-6 max-w-[40ch] text-ds-small text-ds-ink-2">Your details are shared only with this clinic.</p>
        </div>

        <div className="lg:col-span-7">
          {submitted ? (
            <div role="status" aria-live="polite" className="flex min-h-[22rem] flex-col items-start justify-center rounded-ds-lg border border-ds-line bg-ds-surface p-8 shadow-ds-1">
              <CheckCircle2 aria-hidden="true" className="h-10 w-10 text-ds-live" strokeWidth={1.5} />
              <h3 className="mt-5 font-ds-display text-ds-h2 font-medium">Message sent</h3>
              <p className="mt-2 max-w-[40ch] text-ds-body text-ds-ink-2">Thank you. The clinic will contact you soon on the number you gave.</p>
              <DsButton variant="secondary" className="mt-7" onClick={() => setSubmitted(false)}>
                Send another message
              </DsButton>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-5 rounded-ds-lg border border-ds-line bg-ds-surface p-6 shadow-ds-1 sm:p-8">
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="query-name" className="mb-1.5 block text-ds-small font-medium">Your name<Req /></label>
                  <input
                    id="query-name"
                    value={values.name}
                    onChange={(e) => set("name")(e.target.value)}
                    onBlur={touch("name")}
                    autoComplete="name"
                    disabled={submitting}
                    required
                    {...a11y("name")}
                    className={cn(inputClass(!!shown("name")), "h-12")}
                  />
                  {errorText("name")}
                </div>
                <div>
                  <label htmlFor="query-phone" className="mb-1.5 block text-ds-small font-medium">Mobile number<Req /></label>
                  <DigitsInput
                    id="query-phone"
                    value={values.phone}
                    onChange={(e) => set("phone")(e.target.value)}
                    onBlur={touch("phone")}
                    placeholder="10 digits"
                    maxLength={10}
                    inputMode="numeric"
                    autoComplete="tel"
                    disabled={submitting}
                    required
                    {...a11y("phone")}
                    className={cn(inputClass(!!shown("phone")), "h-12")}
                  />
                  {errorText("phone")}
                </div>
              </div>

              {doctors.length >= 2 && (
                <div>
                  <label htmlFor="query-doctor" className="mb-1.5 block text-ds-small font-medium">
                    Who would you like to consult? <span className="font-normal text-ds-ink-3">(optional)</span>
                  </label>
                  <select
                    id="query-doctor"
                    value={doctorId}
                    onChange={(e) => setDoctorId(e.target.value)}
                    disabled={submitting}
                    className={cn(inputClass(false), "h-12")}
                  >
                    <option value="">No preference</option>
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {formatDoctorName(d.display_name)}{d.specialization ? ` (${d.specialization})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label htmlFor="query-email" className="mb-1.5 block text-ds-small font-medium">Email</label>
                <input
                  id="query-email"
                  type="email"
                  value={values.email}
                  onChange={(e) => set("email")(e.target.value)}
                  onBlur={touch("email")}
                  autoComplete="email"
                  disabled={submitting}
                  {...a11y("email")}
                  className={cn(inputClass(!!shown("email")), "h-12")}
                />
                {errorText("email")}
              </div>

              <div>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <label htmlFor="query-message" className="text-ds-small font-medium">Your message<Req /></label>
                  <span className="text-ds-label text-ds-ink-3 ds-tabular">{values.message.length}/{messageLimit}</span>
                </div>
                <textarea
                  id="query-message"
                  value={values.message}
                  onChange={(e) => set("message")(e.target.value)}
                  onBlur={touch("message")}
                  rows={5}
                  maxLength={messageLimit}
                  placeholder="How can the clinic help?"
                  disabled={submitting}
                  required
                  {...a11y("message")}
                  className={cn(inputClass(!!shown("message")), "resize-none py-3")}
                />
                {errorText("message")}
              </div>

              <div className="absolute -left-[9999px] top-0 opacity-0" aria-hidden="true">
                <label htmlFor="query-website">Website</label>
                <input id="query-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </div>

              <DsButton type="submit" size="lg" disabled={submitting} className="w-full sm:w-auto">
                {submitting ? (
                  <><Loader2 aria-hidden="true" className="h-[18px] w-[18px] animate-spin" /> Sending…</>
                ) : (
                  <><Send aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.75} /> Send message</>
                )}
              </DsButton>
            </form>
          )}
        </div>
      </div>
    </section>
  );
};

export default ContactQueryForm;
