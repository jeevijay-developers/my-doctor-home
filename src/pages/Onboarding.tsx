import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowRight, ArrowLeft, Loader2, CheckCircle, Stethoscope, Building, Sparkles } from "lucide-react";

const specializations = [
  "General Physician", "Cardiologist", "Dermatologist", "Pediatrician", "Orthopedic",
  "Gynecologist", "ENT Specialist", "Ophthalmologist", "Neurologist", "Psychiatrist",
  "Dentist", "Urologist", "Pulmonologist", "Gastroenterologist", "Oncologist",
  "Endocrinologist", "Nephrologist", "Rheumatologist", "Surgeon", "Other",
];

const Onboarding = () => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    specialization: "",
    qualifications: "",
    experience_years: "",
    clinic_name: "",
    city: "",
    address: "",
    phone: "",
  });
  const navigate = useNavigate();

  useEffect(() => {
    // Pre-fill name from signup metadata
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { navigate("/auth"); return; }
      const name = user.user_metadata?.full_name || "";
      setForm((f) => ({ ...f, full_name: name }));
    });
  }, [navigate]);

  const update = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }));

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
        full_name: form.full_name,
        specialization: form.specialization,
        qualifications: form.qualifications,
        experience_years: parseInt(form.experience_years) || 0,
        clinic_name: form.clinic_name,
        city: form.city,
        address: form.address,
        phone: form.phone,
        slug,
        onboarding_completed: true,
      }).eq("id", user.id);

      if (error) throw error;
      setStep(4);
    } catch (err: any) {
      toast.error(err.message || "Failed to save profile");
    } finally {
      setLoading(false);
    }
  };

  const stepIcons = [Stethoscope, Building, Sparkles];

  return (
    <div className="min-h-screen bg-secondary flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        {/* Progress */}
        {step < 4 && (
          <div className="flex items-center justify-center gap-2 mb-8">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  s <= step ? "bg-royal text-white" : "bg-muted text-muted-foreground"
                }`}>
                  {s < step ? <CheckCircle className="h-4 w-4" /> : s}
                </div>
                {s < 3 && <div className={`w-12 h-0.5 ${s < step ? "bg-royal" : "bg-muted"}`} />}
              </div>
            ))}
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-lg border border-border p-8">
          {/* Step 1 — Basic Info */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="text-center mb-2">
                <Stethoscope className="h-10 w-10 text-royal mx-auto mb-2" />
                <h2 className="font-heading font-bold text-xl text-primary">Tell Us About You</h2>
                <p className="text-sm text-muted-foreground">Your professional details</p>
              </div>
              <div>
                <Label>Full Name</Label>
                <Input value={form.full_name} onChange={(e) => update("full_name", e.target.value)} placeholder="Dr. Rahul Sharma" required />
              </div>
              <div>
                <Label>Specialization</Label>
                <Select value={form.specialization} onValueChange={(v) => update("specialization", v)}>
                  <SelectTrigger><SelectValue placeholder="Select specialization" /></SelectTrigger>
                  <SelectContent>
                    {specializations.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Qualifications</Label>
                <Input value={form.qualifications} onChange={(e) => update("qualifications", e.target.value)} placeholder="MBBS, MD (Cardiology)" />
              </div>
              <div>
                <Label>Years of Experience</Label>
                <Input type="number" value={form.experience_years} onChange={(e) => update("experience_years", e.target.value)} placeholder="15" />
              </div>
              <Button className="w-full bg-royal hover:bg-royal/90 text-white gap-2" onClick={() => setStep(2)}>
                Next <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Step 2 — Clinic Details */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="text-center mb-2">
                <Building className="h-10 w-10 text-royal mx-auto mb-2" />
                <h2 className="font-heading font-bold text-xl text-primary">Your Clinic</h2>
                <p className="text-sm text-muted-foreground">Where do you practice?</p>
              </div>
              <div>
                <Label>Clinic / Hospital Name</Label>
                <Input value={form.clinic_name} onChange={(e) => update("clinic_name", e.target.value)} placeholder="Sharma Heart Care" />
              </div>
              <div>
                <Label>City</Label>
                <Input value={form.city} onChange={(e) => update("city", e.target.value)} placeholder="Mumbai" />
              </div>
              <div>
                <Label>Full Address</Label>
                <Input value={form.address} onChange={(e) => update("address", e.target.value)} placeholder="Andheri West, Mumbai" />
              </div>
              <div>
                <Label>Phone Number</Label>
                <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="+91 98765 43210" />
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 gap-2" onClick={() => setStep(1)}>
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
                <Button className="flex-1 bg-royal hover:bg-royal/90 text-white gap-2" onClick={() => setStep(3)}>
                  Next <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 3 — Review & Go Live */}
          {step === 3 && (
            <div className="space-y-5">
              <div className="text-center mb-2">
                <Sparkles className="h-10 w-10 text-royal mx-auto mb-2" />
                <h2 className="font-heading font-bold text-xl text-primary">You're Almost Done!</h2>
                <p className="text-sm text-muted-foreground">Review your details and go live</p>
              </div>
              <div className="bg-secondary rounded-xl p-4 space-y-2 text-sm">
                <div><span className="text-muted-foreground">Name:</span> <span className="font-medium text-primary">{form.full_name}</span></div>
                <div><span className="text-muted-foreground">Specialization:</span> <span className="font-medium text-primary">{form.specialization}</span></div>
                <div><span className="text-muted-foreground">Qualifications:</span> <span className="font-medium text-primary">{form.qualifications}</span></div>
                <div><span className="text-muted-foreground">Experience:</span> <span className="font-medium text-primary">{form.experience_years} years</span></div>
                <div><span className="text-muted-foreground">Clinic:</span> <span className="font-medium text-primary">{form.clinic_name}, {form.city}</span></div>
                <div><span className="text-muted-foreground">Phone:</span> <span className="font-medium text-primary">{form.phone}</span></div>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 gap-2" onClick={() => setStep(2)}>
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
                <Button className="flex-1 bg-royal hover:bg-royal/90 text-white gap-2" onClick={handleComplete} disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Go Live! <Sparkles className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 4 — Success */}
          {step === 4 && (
            <div className="text-center space-y-5 py-4">
              <div className="w-20 h-20 rounded-full bg-success/10 mx-auto flex items-center justify-center">
                <CheckCircle className="h-10 w-10 text-success" />
              </div>
              <h2 className="font-heading font-bold text-2xl text-primary">Your Website is Live! 🎉</h2>
              <p className="text-muted-foreground">Your 7-day free trial has started. Explore your dashboard to customize everything.</p>
              <div className="flex flex-col gap-3">
                <Button className="w-full bg-royal hover:bg-royal/90 text-white" onClick={() => navigate("/admin/dashboard")}>
                  Go to Dashboard
                </Button>
                <Button variant="outline" className="w-full" onClick={() => navigate(`/dr/${generateSlug(form.full_name)}`)}>
                  View My Website
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
