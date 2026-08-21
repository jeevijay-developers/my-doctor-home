import { useState } from "react";
import { Send, CheckCircle2 } from "lucide-react";
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

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

// Lightweight "get in touch" form, separate from the booking flow — a
// visitor doesn't have to be booking an appointment to reach the doctor.
const ContactQueryForm = ({ cardColor = "card" }: { cardColor?: CardColor }) => {
  const { profile } = useDoctorData();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  // Honeypot: real visitors never see or fill this field (visually hidden,
  // off the tab order). A bot that fills every input trips it; we just
  // pretend to succeed rather than tipping it off.
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const reset = () => { setName(""); setPhone(""); setEmail(""); setMessage(""); setWebsite(""); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.id) return;

    if (!name.trim()) { toast.error("Please enter your name."); return; }
    if (!phone.trim() && !email.trim()) { toast.error("Please provide a phone number or email so the doctor can reach you."); return; }
    if (phone.trim() && !isValidIndianPhone(phone)) { toast.error(phoneErrorMessage); return; }
    if (email.trim() && !isValidEmail(email)) { toast.error("Enter a valid email or leave it blank."); return; }
    if (!message.trim()) { toast.error("Please enter your message."); return; }

    if (website.trim()) {
      // Honeypot tripped — silently "succeed" without writing anything.
      setSubmitted(true);
      reset();
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from("patient_queries").insert({
      doctor_id: profile.id,
      name: name.trim(),
      phone: phone.trim() ? normalizeIndianPhone(phone) : null,
      email: email.trim() || null,
      message: message.trim(),
    });
    setSubmitting(false);

    if (error) {
      if (error.message?.includes("PATIENT_QUERY_RATE_LIMITED")) {
        toast.error("Please wait a moment before sending another message.");
      } else {
        toast.error("Couldn't send your message. Please try again.");
      }
      return;
    }

    setSubmitted(true);
    reset();
  };

  return (
    <section className={`relative py-10 md:py-24 overflow-hidden ${cardColorClass(cardColor)}`}>
      <div className="container mx-auto px-4 relative z-10">
        <h2 className="font-heading font-bold text-xl md:text-4xl text-foreground text-center mb-2 md:mb-3">
          Get in Touch
        </h2>
        <p className="text-sm md:text-base text-muted-foreground text-center mb-6 md:mb-10 max-w-lg mx-auto">
          Have a question that isn't about booking an appointment? Send a message and the clinic will get back to you.
        </p>

        <div className="max-w-lg mx-auto rounded-2xl border border-border bg-white dark:bg-gray-800 shadow-sm p-5 md:p-8">
          {submitted ? (
            <div className="text-center py-8">
              <CheckCircle2 className="h-10 w-10 text-success mx-auto mb-3" />
              <h3 className="font-heading font-semibold text-lg text-foreground mb-1">Message sent</h3>
              <p className="text-sm text-muted-foreground mb-5">Thanks for reaching out — the clinic will get back to you soon.</p>
              <Button variant="outline" onClick={() => setSubmitted(false)}>Send another message</Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="query-name">Name *</Label>
                <Input id="query-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" className="h-10" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="query-phone">Phone</Label>
                  <DigitsInput id="query-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile number" maxLength={10} className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="query-email">Email</Label>
                  <Input id="query-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="h-10" />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground -mt-2">Provide at least one so the clinic can reach you.</p>

              <div className="space-y-1.5">
                <Label htmlFor="query-message">Message *</Label>
                <Textarea id="query-message" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What would you like to ask?" rows={4} />
              </div>

              {/* Honeypot — hidden from real visitors via CSS + aria, not just display:none, and off the tab order. */}
              <div className="absolute -left-[9999px] top-0 opacity-0" aria-hidden="true">
                <label htmlFor="query-website">Website</label>
                <input
                  id="query-website"
                  name="website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </div>

              <Button type="submit" disabled={submitting} className="w-full bg-royal hover:bg-royal/90">
                {submitting ? "Sending..." : <><Send className="h-4 w-4 mr-1.5" /> Send Message</>}
              </Button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
};

export default ContactQueryForm;
