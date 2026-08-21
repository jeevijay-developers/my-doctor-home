import { useState } from "react";
import { CheckCircle2, Clock3, Loader2, Mail, MessageSquare, Send, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DigitsInput } from "@/components/ui/digits-input";
import { useDoctorData } from "@/contexts/DoctorContext";
import { supabase } from "@/integrations/supabase/client";
import { isValidIndianPhone, normalizeIndianPhone, phoneErrorMessage } from "@/lib/phone";
import { cardColorClass, type CardColor } from "@/lib/cardColor";
import { toast } from "sonner";

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const ContactQueryForm = ({ cardColor = "card" }: { cardColor?: CardColor }) => {
  const { profile } = useDoctorData();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const reset = () => { setName(""); setPhone(""); setEmail(""); setMessage(""); setWebsite(""); };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile?.id) return;

    if (!name.trim()) { toast.error("Please enter your name."); return; }
    if (!phone.trim()) { toast.error("Please enter your phone number."); return; }
    if (!isValidIndianPhone(phone)) { toast.error(phoneErrorMessage); return; }
    if (email.trim() && !isValidEmail(email)) { toast.error("Enter a valid email or leave it blank."); return; }
    if (!message.trim()) { toast.error("Please enter your message."); return; }

    if (website.trim()) {
      setSubmitted(true);
      reset();
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from("patient_queries").insert({
      doctor_id: profile.id,
      name: name.trim(),
      phone: normalizeIndianPhone(phone),
      email: email.trim() || null,
      message: message.trim(),
    });
    setSubmitting(false);

    if (error) {
      if (error.message?.includes("PATIENT_QUERY_RATE_LIMITED")) toast.error("Please wait a moment before sending another message.");
      else toast.error("Couldn't send your message. Please try again.");
      return;
    }

    setSubmitted(true);
    reset();
  };

  const fieldClass = "h-12 rounded-xl border-slate-200 bg-slate-50/70 px-4 shadow-none transition focus-visible:border-[#3C83FC] focus-visible:ring-[#3C83FC]/20 dark:border-gray-700 dark:bg-gray-950/60";

  return (
    <section className={`relative overflow-hidden py-14 md:py-24 ${cardColorClass(cardColor)}`}>
      <div className="relative z-10 mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
        <div className="mx-auto mb-9 max-w-3xl text-center md:mb-12">
          <span className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.18em] text-[#3C83FC]"><MessageSquare className="h-4 w-4" /> Contact the clinic</span>
          <h2 className="mt-3 font-heading text-3xl font-black tracking-tight text-[#092b50] dark:text-white md:text-5xl">Have a Question?</h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-slate-500 dark:text-slate-400 md:text-base">Send a message to the clinic team and they will contact you using the details you provide.</p>
        </div>

        <div className="mx-auto grid max-w-5xl overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-[0_18px_55px_rgba(15,43,80,0.1)] dark:border-blue-900/60 dark:bg-gray-900 lg:grid-cols-[0.78fr_1.22fr]">
          <div className="relative overflow-hidden bg-gradient-to-br from-[#092b50] via-[#155ba5] to-[#3C83FC] p-7 text-white sm:p-9">
            <div className="absolute -right-20 -top-20 h-52 w-52 rounded-full bg-white/10 blur-2xl" />
            <div className="relative">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/20 bg-white/10 backdrop-blur"><Mail className="h-6 w-6" /></span>
              <h3 className="mt-6 font-heading text-2xl font-black">We're here to help</h3>
              <p className="mt-3 text-sm leading-7 text-blue-100">Use this form for general questions. For urgent medical concerns, contact local emergency services.</p>

              <div className="mt-8 space-y-5">
                <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10"><Clock3 className="h-4 w-4" /></span><div><p className="text-sm font-extrabold">Clinic response</p><p className="mt-1 text-xs leading-5 text-blue-100">The clinic will respond as soon as possible during working hours.</p></div></div>
                <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10"><ShieldCheck className="h-4 w-4" /></span><div><p className="text-sm font-extrabold">Your details are protected</p><p className="mt-1 text-xs leading-5 text-blue-100">Your contact information is shared only with this clinic.</p></div></div>
              </div>
            </div>
          </div>

          <div className="p-5 sm:p-8 lg:p-10">
            {submitted ? (
              <div className="flex min-h-[430px] flex-col items-center justify-center text-center" role="status" aria-live="polite">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300"><CheckCircle2 className="h-8 w-8" /></span>
                <h3 className="mt-5 font-heading text-2xl font-black text-[#092b50] dark:text-white">Message sent successfully</h3>
                <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500 dark:text-slate-400">Thank you for reaching out. The clinic team will contact you soon.</p>
                <Button type="button" variant="outline" onClick={() => setSubmitted(false)} className="mt-7 h-11 rounded-xl border-blue-200 px-5 font-bold text-[#3C83FC] hover:bg-blue-50 dark:border-blue-900 dark:hover:bg-blue-950/30">Send Another Message</Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="query-name" className="font-bold text-[#092b50] dark:text-white">Full Name <span className="text-red-500">*</span></Label>
                    <Input id="query-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter your full name" autoComplete="name" disabled={submitting} className={fieldClass} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="query-phone" className="font-bold text-[#092b50] dark:text-white">Phone Number <span className="text-red-500">*</span></Label>
                    <DigitsInput id="query-phone" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="10-digit mobile number" maxLength={10} autoComplete="tel" required disabled={submitting} className={fieldClass} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="query-email" className="font-bold text-[#092b50] dark:text-white">Email Address <span className="font-normal text-slate-400">(optional)</span></Label>
                  <Input id="query-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" disabled={submitting} className={fieldClass} />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3"><Label htmlFor="query-message" className="font-bold text-[#092b50] dark:text-white">Your Message <span className="text-red-500">*</span></Label><span className="text-xs text-slate-400">{message.length}/1000</span></div>
                  <Textarea id="query-message" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="How can the clinic help you?" rows={6} maxLength={1000} disabled={submitting} className="resize-none rounded-xl border-slate-200 bg-slate-50/70 px-4 py-3 shadow-none transition focus-visible:border-[#3C83FC] focus-visible:ring-[#3C83FC]/20 dark:border-gray-700 dark:bg-gray-950/60" />
                </div>

                <div className="absolute -left-[9999px] top-0 opacity-0" aria-hidden="true">
                  <label htmlFor="query-website">Website</label>
                  <input id="query-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
                </div>

                <Button type="submit" disabled={submitting} className="h-12 w-full rounded-xl bg-[#3C83FC] text-sm font-extrabold text-white shadow-[0_10px_24px_rgba(60,131,252,0.24)] transition hover:-translate-y-0.5 hover:bg-blue-500 disabled:translate-y-0">
                  {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending Message…</> : <><Send className="mr-2 h-4 w-4" /> Send Message</>}
                </Button>
                <p className="text-center text-xs leading-5 text-slate-400">A phone number is required so the clinic can respond to your message.</p>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ContactQueryForm;
