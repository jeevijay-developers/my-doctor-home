import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowRight, ArrowLeft, Loader2, CheckCircle, Stethoscope, Building, Sparkles, Globe, Phone, MapPin, GraduationCap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const specializations = [
  "General Physician", "Cardiologist", "Dermatologist", "Pediatrician", "Orthopedic",
  "Gynecologist", "ENT Specialist", "Ophthalmologist", "Neurologist", "Psychiatrist",
  "Dentist", "Urologist", "Pulmonologist", "Gastroenterologist", "Oncologist",
  "Endocrinologist", "Nephrologist", "Rheumatologist", "Surgeon", "Other",
];

const steps = [
  { num: 1, label: "Your Details", icon: Stethoscope, desc: "Professional info" },
  { num: 2, label: "Your Clinic", icon: Building, desc: "Practice location" },
  { num: 3, label: "Go Live", icon: Sparkles, desc: "Review & launch" },
];

const Onboarding = () => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    full_name: "", specialization: "", qualifications: "", experience_years: "",
    clinic_name: "", city: "", address: "", phone: "", bio: "", consultation_fee: "",
  });
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { navigate("/auth"); return; }
      const name = user.user_metadata?.full_name || "";
      setForm((f) => ({ ...f, full_name: name }));
    });
  }, [navigate]);

  const update = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }));

  const validateStep1 = () => {
    if (!form.full_name.trim()) return toast.error("Please enter your full name");
    if (!form.specialization) return toast.error("Please select your specialization");
    if (!form.qualifications.trim()) return toast.error("Please enter your qualifications");
    if (!form.experience_years || parseInt(form.experience_years) < 0) return toast.error("Please enter years of experience");
    if (!form.consultation_fee || parseInt(form.consultation_fee) < 0) return toast.error("Please enter your consultation fee");
    setStep(2);
  };

  const validateStep2 = () => {
    if (!form.clinic_name.trim()) return toast.error("Please enter your clinic/hospital name");
    if (!form.city.trim()) return toast.error("Please enter your city");
    if (!form.phone.trim()) return toast.error("Please enter your phone number");
    if (!form.address.trim()) return toast.error("Please enter your full address");
    setStep(3);
  };

  const generateSlug = (name: string) =>
    name.toLowerCase().replace(/^dr\.?\s*/i, "dr-").replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");

  const getUniqueSlug = async (name: string) => {
    let slug = generateSlug(name);
    const { data } = await supabase.from("profiles").select("id").eq("slug", slug);
    if (data && data.length > 0) {
      slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    }
    return slug;
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const slug = await getUniqueSlug(form.full_name);
      const { error } = await supabase.from("profiles").update({
        full_name: form.full_name, specialization: form.specialization,
        qualifications: form.qualifications, experience_years: parseInt(form.experience_years) || 0,
        clinic_name: form.clinic_name, city: form.city, address: form.address,
        phone: form.phone, slug, onboarding_completed: true,
      }).eq("id", user.id);
      if (error) throw error;
      setStep(4);
    } catch (err: any) {
      toast.error(err.message || "Failed to save profile");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-secondary">
      {/* Desktop Sidebar Stepper */}
      <div className="hidden lg:flex w-[300px] gradient-navy-teal p-8 flex-col relative overflow-hidden">
        <div className="absolute top-20 -right-10 w-40 h-40 rounded-full bg-white/5 blur-3xl" />
        <div className="absolute bottom-10 left-5 w-32 h-32 rounded-full bg-spark/10 blur-2xl" />

        <div className="relative z-10 mb-12">
          <img src="/doctylia-logo.png" alt="Doctylia" className="h-8 brightness-0 invert mb-1" />
          <p className="text-white/40 text-xs">Setup your practice</p>
        </div>

        <div className="relative z-10 flex-1 space-y-0">
          {steps.map((s, i) => (
            <div key={s.num} className="relative">
              <div className="flex items-start gap-4 py-4">
                <div className="relative">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 ${
                    step > s.num ? "bg-spark text-primary" :
                    step === s.num ? "bg-white/20 text-white border border-white/30" :
                    "bg-white/5 text-white/30"
                  }`}>
                    {step > s.num ? (
                      <CheckCircle className="h-5 w-5" />
                    ) : (
                      <s.icon className="h-5 w-5" />
                    )}
                  </div>
                  {i < steps.length - 1 && (
                    <div className={`absolute top-11 left-1/2 -translate-x-1/2 w-0.5 h-8 transition-colors ${
                      step > s.num ? "bg-spark" : "bg-white/10"
                    }`} />
                  )}
                </div>
                <div className="pt-1">
                  <div className={`text-sm font-semibold transition-colors ${
                    step >= s.num ? "text-white" : "text-white/30"
                  }`}>{s.label}</div>
                  <div className="text-xs text-white/40">{s.desc}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="relative z-10 text-white/20 text-xs">
          Your data is secure & encrypted
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-lg">
          {/* Mobile Stepper */}
          {step < 4 && (
            <div className="lg:hidden flex items-center justify-center gap-2 mb-6">
              {steps.map((s, i) => (
                <div key={s.num} className="flex items-center gap-2">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold transition-all ${
                    step > s.num ? "bg-success text-white" :
                    step === s.num ? "bg-royal text-white" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {step > s.num ? <CheckCircle className="h-4 w-4" /> : s.num}
                  </div>
                  {i < steps.length - 1 && (
                    <div className={`w-10 h-0.5 rounded ${step > s.num ? "bg-success" : "bg-muted"}`} />
                  )}
                </div>
              ))}
            </div>
          )}

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <div className="bg-card rounded-2xl shadow-xl border border-border p-5 sm:p-7">
                {/* Step 1 */}
                {step === 1 && (
                  <div className="space-y-5">
                    <div className="text-center mb-2">
                      <div className="w-14 h-14 rounded-2xl bg-royal/10 flex items-center justify-center mx-auto mb-3">
                        <Stethoscope className="h-7 w-7 text-royal" />
                      </div>
                      <h2 className="font-heading font-bold text-xl text-primary">Tell Us About You</h2>
                      <p className="text-sm text-muted-foreground">Your professional details</p>
                    </div>
                    <div>
                      <Label>Full Name <span className="text-destructive">*</span></Label>
                      <Input value={form.full_name} onChange={(e) => update("full_name", e.target.value)} placeholder="Dr. Rahul Sharma" required className="h-11" />
                    </div>
                    <div>
                      <Label>Specialization <span className="text-destructive">*</span></Label>
                      <Select value={form.specialization} onValueChange={(v) => update("specialization", v)}>
                        <SelectTrigger className="h-11"><SelectValue placeholder="Select specialization" /></SelectTrigger>
                        <SelectContent>
                          {specializations.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="flex items-center gap-1.5"><GraduationCap className="h-3.5 w-3.5" /> Qualifications <span className="text-destructive">*</span></Label>
                      <Input value={form.qualifications} onChange={(e) => update("qualifications", e.target.value)} placeholder="MBBS, MD (Cardiology)" className="h-11" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label>Years of Experience <span className="text-destructive">*</span></Label>
                        <Input type="number" value={form.experience_years} onChange={(e) => update("experience_years", e.target.value)} placeholder="15" className="h-11" />
                      </div>
                      <div>
                        <Label>Consultation Fee (₹) <span className="text-destructive">*</span></Label>
                        <Input type="number" value={form.consultation_fee} onChange={(e) => update("consultation_fee", e.target.value)} placeholder="500" className="h-11" />
                      </div>
                    </div>
                    <div>
                      <Label>About / Bio (optional)</Label>
                      <Textarea value={form.bio} onChange={(e) => update("bio", e.target.value)} placeholder="Tell patients about your practice..." rows={3} />
                    </div>
                    <Button className="w-full h-11 bg-royal hover:bg-royal/90 text-white gap-2 font-semibold" onClick={validateStep1}>
                      Next <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {/* Step 2 */}
                {step === 2 && (
                  <div className="space-y-5">
                    <div className="text-center mb-2">
                      <div className="w-14 h-14 rounded-2xl bg-teal/10 flex items-center justify-center mx-auto mb-3">
                        <Building className="h-7 w-7 text-teal" />
                      </div>
                      <h2 className="font-heading font-bold text-xl text-primary">Your Clinic</h2>
                      <p className="text-sm text-muted-foreground">Where do you practice?</p>
                    </div>
                    <div>
                      <Label className="flex items-center gap-1.5"><Building className="h-3.5 w-3.5" /> Clinic / Hospital Name <span className="text-destructive">*</span></Label>
                      <Input value={form.clinic_name} onChange={(e) => update("clinic_name", e.target.value)} placeholder="Sharma Heart Care" className="h-11" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> City <span className="text-destructive">*</span></Label>
                        <Input value={form.city} onChange={(e) => update("city", e.target.value)} placeholder="Mumbai" className="h-11" />
                      </div>
                      <div>
                        <Label className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> Phone Number <span className="text-destructive">*</span></Label>
                        <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="+91 98765 43210" className="h-11" />
                      </div>
                    </div>
                    <div>
                      <Label>Full Address <span className="text-destructive">*</span></Label>
                      <Textarea value={form.address} onChange={(e) => update("address", e.target.value)} placeholder="Building, Street, Area, City" rows={2} />
                    </div>
                    <div className="flex gap-3">
                      <Button variant="outline" className="flex-1 h-11 gap-2" onClick={() => setStep(1)}>
                        <ArrowLeft className="h-4 w-4" /> Back
                      </Button>
                      <Button className="flex-1 h-11 bg-royal hover:bg-royal/90 text-white gap-2 font-semibold" onClick={validateStep2}>
                        Next <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Step 3 — Review */}
                {step === 3 && (
                  <div className="space-y-5">
                    <div className="text-center mb-2">
                      <div className="w-14 h-14 rounded-2xl bg-success/10 flex items-center justify-center mx-auto mb-3">
                        <Sparkles className="h-7 w-7 text-success" />
                      </div>
                      <h2 className="font-heading font-bold text-xl text-primary">You're Almost Done!</h2>
                      <p className="text-sm text-muted-foreground">Review your details and go live</p>
                    </div>

                    {/* Review Summary */}
                    <div className="bg-secondary rounded-xl p-4 space-y-3 text-sm">
                      {[
                        { label: "Name", value: form.full_name },
                        { label: "Specialization", value: form.specialization },
                        { label: "Qualifications", value: form.qualifications },
                        { label: "Experience", value: `${form.experience_years} years` },
                        { label: "Clinic", value: `${form.clinic_name}, ${form.city}` },
                        { label: "Phone", value: form.phone },
                      ].map((item) => (
                        <div key={item.label} className="flex justify-between">
                          <span className="text-muted-foreground">{item.label}</span>
                          <span className="font-medium text-foreground text-right">{item.value || "—"}</span>
                        </div>
                      ))}
                    </div>

                    {/* Website Preview Mockup */}
                    <div className="rounded-xl border border-border bg-card p-4">
                      <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                        <Globe className="h-3.5 w-3.5" /> YOUR WEBSITE PREVIEW
                      </p>
                      <div className="rounded-lg border border-border bg-secondary/50 p-4 space-y-2">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-royal/10 flex items-center justify-center text-royal font-bold text-lg">
                            {form.full_name?.charAt(0)?.toUpperCase() || "D"}
                          </div>
                          <div>
                            <div className="font-heading font-bold text-sm text-foreground">{form.full_name || "Doctor Name"}</div>
                            <div className="text-xs text-muted-foreground">{form.specialization || "Specialization"}</div>
                            <div className="text-xs text-muted-foreground">{form.clinic_name || "Clinic"}, {form.city || "City"}</div>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-2">
                          <div className="h-7 px-3 rounded-md bg-royal/10 text-royal text-xs flex items-center font-medium">Book Appointment</div>
                          <div className="h-7 px-3 rounded-md bg-teal/10 text-teal text-xs flex items-center font-medium">Services</div>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <Button variant="outline" className="flex-1 h-11 gap-2" onClick={() => setStep(2)}>
                        <ArrowLeft className="h-4 w-4" /> Back
                      </Button>
                      <Button className="flex-1 h-11 bg-royal hover:bg-royal/90 text-white gap-2 font-semibold" onClick={handleComplete} disabled={loading}>
                        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                        Go Live! <Sparkles className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Step 4 — Success */}
                {step === 4 && (
                  <div className="text-center space-y-5 py-6">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 200 }}
                      className="w-24 h-24 rounded-full bg-success/10 mx-auto flex items-center justify-center"
                    >
                      <CheckCircle className="h-12 w-12 text-success" />
                    </motion.div>
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                      <h2 className="font-heading font-bold text-2xl text-primary">Your Website is Live! 🎉</h2>
                      <p className="text-muted-foreground mt-2">Your 7-day free trial has started. Explore your dashboard to customize everything.</p>
                    </motion.div>
                    <div className="flex flex-col gap-3 pt-2">
                      <Button className="w-full h-11 bg-royal hover:bg-royal/90 text-white font-semibold" onClick={() => navigate("/admin/dashboard")}>
                        Go to Dashboard
                      </Button>
                      <Button variant="outline" className="w-full h-11" onClick={() => navigate(`/dr/${generateSlug(form.full_name)}`)}>
                        <Globe className="h-4 w-4 mr-2" /> View My Website
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
