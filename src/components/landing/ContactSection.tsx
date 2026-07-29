import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Mail, Phone, MapPin, Send, CheckCircle } from "lucide-react";
import { z } from "zod";
import { isValidIndianPhone, phoneErrorMessage } from "@/lib/phone";

const enquirySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Invalid email address").max(255),
  phone: z.string().trim().min(1, "Phone number is required").refine(isValidIndianPhone, phoneErrorMessage),
  clinic_name: z.string().trim().max(100).optional(),
  city: z.string().trim().max(50).optional(),
  message: z.string().trim().max(1000).optional(),
});

const ContactSection = () => {
  const [form, setForm] = useState({ name: "", email: "", phone: "", clinic_name: "", city: "", message: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    const result = enquirySchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => { if (err.path[0]) fieldErrors[err.path[0] as string] = err.message; });
      setErrors(fieldErrors);
      return;
    }
    setLoading(true);
    const { error } = await supabase.from("enquiries" as any).insert([{
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      clinic_name: form.clinic_name.trim() || null,
      city: form.city.trim() || null,
      message: form.message.trim() || null,
    }]);
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
      <section id="contact" className="py-14 md:py-20 bg-white">
        <div className="container mx-auto px-4 text-center">
          <div className="max-w-md mx-auto">
            <CheckCircle className="h-14 w-14 md:h-16 md:w-16 text-success mx-auto mb-4" />
            <h3 className="font-heading font-bold text-xl md:text-2xl text-primary">Thank You!</h3>
            <p className="text-sm md:text-base text-muted-foreground mt-2">Your enquiry has been submitted. Our team will contact you within 24 hours.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="contact" className="py-14 md:py-20 bg-white">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
          <span className="text-xs md:text-sm font-semibold text-accent uppercase tracking-wider">Contact Us</span>
          <h2 className="font-heading font-bold text-2xl sm:text-3xl md:text-4xl text-primary mt-2">
            Have Questions? Let's Talk
          </h2>
          <p className="text-sm md:text-base text-muted-foreground mt-3">Fill out the form and our team will get back to you within 24 hours.</p>
        </div>
        <div className="grid lg:grid-cols-5 gap-6 md:gap-10 max-w-5xl mx-auto">
          {/* Left — Contact Info */}
          <div className="lg:col-span-2 space-y-5">
            <div className="rounded-xl overflow-hidden shadow-md border border-border">
              <img
                src="https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&h=200&fit=crop&q=80"
                alt="Modern office workspace"
                className="w-full h-32 md:h-40 object-cover"
                loading="lazy"
              />
            </div>
            <div className="bg-primary rounded-2xl p-6 md:p-8 text-white space-y-6 md:space-y-8">
              <h3 className="font-heading font-bold text-lg md:text-xl">Get in Touch</h3>
              <div className="space-y-4 md:space-y-5">
                <div className="flex items-start gap-3">
                  <Mail className="h-5 w-5 mt-0.5 text-accent shrink-0" />
                  <div>
                    <div className="text-sm font-medium">Email</div>
                    <div className="text-sm text-primary-foreground/70">support@doctylia.com</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Phone className="h-5 w-5 mt-0.5 text-accent shrink-0" />
                  <div>
                    <div className="text-sm font-medium">Phone</div>
                    <div className="text-sm text-primary-foreground/70">+91 86194 83010</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 mt-0.5 text-accent shrink-0" />
                  <div>
                    <div className="text-sm font-medium">Office</div>
                    <div className="text-sm text-primary-foreground/70 break-words">22, Second Floor, Jeevijay Technologies Pvt. Ltd., Aerodrome, Behind Modern Petrol Pump, Kota, Rajasthan</div>
                  </div>
                </div>
              </div>
              <div className="pt-4 border-t border-primary-foreground/10">
                <p className="text-xs text-primary-foreground/50">We typically respond within 2-4 hours during business hours (Mon-Sat, 9 AM - 7 PM IST)</p>
              </div>
            </div>
          </div>
          {/* Right — Form */}
          <div className="lg:col-span-3">
            <form onSubmit={handleSubmit} className="bg-secondary rounded-2xl p-5 md:p-8 shadow-sm border border-border space-y-4 md:space-y-5">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Full Name *</Label>
                  <Input id="name" placeholder="Dr. Rahul Sharma" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={errors.name ? "border-destructive" : ""} />
                  {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
                </div>
                <div>
                  <Label htmlFor="email">Email *</Label>
                  <Input id="email" type="email" placeholder="doctor@email.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={errors.email ? "border-destructive" : ""} />
                  {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" placeholder="+91 98765 43210" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="clinic_name">Clinic Name</Label>
                  <Input id="clinic_name" placeholder="Your Clinic Name" value={form.clinic_name} onChange={(e) => setForm({ ...form, clinic_name: e.target.value })} />
                </div>
              </div>
              <div>
                <Label htmlFor="city">City</Label>
                <Input id="city" placeholder="Mumbai" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="message">Message</Label>
                <Textarea id="message" placeholder="Tell us about your practice and what you need..." rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
              </div>
              <Button type="submit" disabled={loading} className="w-full bg-royal hover:bg-royal/90 text-white gap-2">
                <Send className="h-4 w-4" /> {loading ? "Submitting..." : "Send Enquiry"}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ContactSection;
