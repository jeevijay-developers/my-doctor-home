import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { Settings, User, MapPin, Crown, LogOut, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { differenceInDays } from "date-fns";

const specializations = [
  "General Physician", "Cardiologist", "Dermatologist", "Orthopedic", "Pediatrician",
  "Gynecologist", "ENT Specialist", "Neurologist", "Psychiatrist", "Ophthalmologist",
  "Dentist", "Urologist", "Pulmonologist", "Gastroenterologist", "Oncologist",
  "Endocrinologist", "Nephrologist", "Rheumatologist", "Surgeon", "Other",
];

const SettingsPage = () => {
  const { profile } = useProfile();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: "", specialization: "", qualifications: "", experience_years: 0,
    phone: "", clinic_name: "", city: "", address: "",
  });

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name || "",
        specialization: profile.specialization || "",
        qualifications: profile.qualifications || "",
        experience_years: profile.experience_years || 0,
        phone: profile.phone || "",
        clinic_name: profile.clinic_name || "",
        city: profile.city || "",
        address: profile.address || "",
      });
    }
  }, [profile]);

  const save = async () => {
    if (!profile) return;
    setSaving(true);
    await supabase.from("profiles").update(form).eq("id", profile.id);
    setSaving(false);
    toast({ title: "Settings saved" });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    const ext = file.name.split(".").pop();
    const path = `${profile.id}/profile.${ext}`;
    const { error } = await supabase.storage.from("doctor-uploads").upload(path, file, { upsert: true });
    if (error) { toast({ title: "Upload failed", description: error.message, variant: "destructive" }); return; }
    const { data: { publicUrl } } = supabase.storage.from("doctor-uploads").getPublicUrl(path);
    await supabase.from("profiles").update({ profile_photo_url: publicUrl }).eq("id", profile.id);
    toast({ title: "Photo updated" });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const daysLeft = profile?.trial_end ? Math.max(0, differenceInDays(new Date(profile.trial_end), new Date())) : 7;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <h1 className="font-heading font-bold text-2xl text-primary flex items-center gap-2">
        <Settings className="h-6 w-6 text-muted-foreground" /> Settings
      </h1>

      {/* Profile */}
      <section className="bg-card rounded-xl p-6 border border-border space-y-5">
        <h2 className="font-heading font-semibold text-lg text-primary flex items-center gap-2"><User className="h-5 w-5 text-royal" /> Profile</h2>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center overflow-hidden border-2 border-border">
            {profile?.profile_photo_url ? (
              <img src={profile.profile_photo_url} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <User className="h-8 w-8 text-muted-foreground" />
            )}
          </div>
          <label className="cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
            <div className="flex items-center gap-2 text-sm text-royal hover:underline"><Upload className="h-4 w-4" /> Upload Photo</div>
          </label>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><Label>Full Name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
          <div>
            <Label>Specialization</Label>
            <Select value={form.specialization} onValueChange={(v) => setForm({ ...form, specialization: v })}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{specializations.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Qualifications</Label><Input value={form.qualifications} onChange={(e) => setForm({ ...form, qualifications: e.target.value })} placeholder="MBBS, MD..." /></div>
          <div><Label>Years of Experience</Label><Input type="number" value={form.experience_years} onChange={(e) => setForm({ ...form, experience_years: Number(e.target.value) })} /></div>
          <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91" /></div>
        </div>
      </section>

      {/* Clinic */}
      <section className="bg-card rounded-xl p-6 border border-border space-y-5">
        <h2 className="font-heading font-semibold text-lg text-primary flex items-center gap-2"><MapPin className="h-5 w-5 text-accent" /> Clinic Details</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><Label>Clinic Name</Label><Input value={form.clinic_name} onChange={(e) => setForm({ ...form, clinic_name: e.target.value })} /></div>
          <div><Label>City</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
        </div>
        <div><Label>Full Address</Label><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} /></div>
      </section>

      {/* Plan */}
      <section className="bg-card rounded-xl p-6 border border-border">
        <h2 className="font-heading font-semibold text-lg text-primary flex items-center gap-2 mb-4"><Crown className="h-5 w-5 text-warning" /> Subscription</h2>
        <div className="flex items-center justify-between p-4 rounded-xl bg-secondary">
          <div>
            <div className="font-medium text-primary capitalize">{profile?.plan_status || "trial"} Plan</div>
            {profile?.plan_status === "trial" && (
              <div className="text-sm text-muted-foreground">{daysLeft} day{daysLeft !== 1 ? "s" : ""} remaining in free trial</div>
            )}
          </div>
          <Button variant="outline" className="border-royal text-royal">Upgrade</Button>
        </div>
      </section>

      {/* Actions */}
      <div className="flex justify-between">
        <Button onClick={save} disabled={saving} className="bg-royal hover:bg-royal/90">{saving ? "Saving..." : "Save Settings"}</Button>
        <Button variant="ghost" className="text-destructive" onClick={handleLogout}><LogOut className="h-4 w-4 mr-2" /> Logout</Button>
      </div>
    </div>
  );
};

export default SettingsPage;
