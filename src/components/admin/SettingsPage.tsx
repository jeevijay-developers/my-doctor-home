import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { Settings, User, MapPin, Crown, LogOut, Upload, Shield, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
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
  const [exporting, setExporting] = useState(false);
  const [form, setForm] = useState({
    full_name: "", specialization: "", qualifications: "", experience_years: 0,
    phone: "", clinic_name: "", city: "", address: "",
    gstin: "", gst_registered: false,
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
        gstin: (profile as any).gstin || "",
        gst_registered: Boolean((profile as any).gst_registered),
      });
    }
  }, [profile]);

  const save = async () => {
    if (!profile) return;
    setSaving(true);
    await supabase.from("profiles").update(form as any).eq("id", profile.id);
    setSaving(false);
    toast.success("Settings saved");
  };

  const exportAllData = async () => {
    if (!profile) return;
    setExporting(true);
    try {
      const doctorId = profile.id;
      const tables = [
        "services", "packages", "working_hours", "appointments",
        "patients", "reviews", "blog_posts", "invoices", "website_settings",
      ] as const;
      const results: Record<string, any> = { profile };
      for (const t of tables) {
        const { data } = await (supabase.from(t as any) as any).select("*").eq("doctor_id", doctorId);
        results[t] = data || [];
      }
      const blob = new Blob([JSON.stringify(results, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = (profile.full_name || "doctor").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      a.download = `doctylia-full-export-${safeName}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Data export downloaded");
    } catch (e: any) {
      toast.error("Export failed: " + (e?.message || "unknown error"));
    } finally {
      setExporting(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    const ext = file.name.split(".").pop();
    const path = `${profile.id}/profile.${ext}`;
    const { error } = await supabase.storage.from("doctor-uploads").upload(path, file, { upsert: true });
    if (error) { toast.error("Upload failed: " + error.message); return; }
    const { data: { publicUrl } } = supabase.storage.from("doctor-uploads").getPublicUrl(path);
    await supabase.from("profiles").update({ profile_photo_url: publicUrl }).eq("id", profile.id);
    toast.success("Photo updated");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const daysLeft = profile?.trial_end ? Math.max(0, differenceInDays(new Date(profile.trial_end), new Date())) : 7;
  const trialProgress = ((7 - daysLeft) / 7) * 100;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="font-heading font-bold text-2xl text-primary flex items-center gap-2">
        <Settings className="h-6 w-6 text-muted-foreground" /> Settings
      </h1>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="bg-card border border-border h-11 w-full overflow-x-auto flex-nowrap justify-start sm:justify-center">
          <TabsTrigger value="profile" className="gap-1.5"><User className="h-3.5 w-3.5" /> Profile</TabsTrigger>
          <TabsTrigger value="clinic" className="gap-1.5"><MapPin className="h-3.5 w-3.5" /> Clinic</TabsTrigger>
          <TabsTrigger value="subscription" className="gap-1.5"><Crown className="h-3.5 w-3.5" /> Subscription</TabsTrigger>
          <TabsTrigger value="account" className="gap-1.5"><Shield className="h-3.5 w-3.5" /> Account</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <Card className="border-border/60 shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><User className="h-5 w-5 text-royal" /> Your Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Photo Upload */}
              <div className="flex items-center gap-5">
                <div className="relative group">
                  <div className="w-24 h-24 rounded-2xl bg-secondary flex items-center justify-center overflow-hidden border-2 border-border">
                    {profile?.profile_photo_url ? (
                      <img src={profile.profile_photo_url} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <User className="h-10 w-10 text-muted-foreground" />
                    )}
                  </div>
                  <label className="absolute inset-0 bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer flex items-center justify-center">
                    <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                    <Upload className="h-5 w-5 text-white" />
                  </label>
                </div>
                <div>
                  <p className="font-medium text-foreground">{profile?.full_name || "Your Name"}</p>
                  <p className="text-sm text-muted-foreground">{profile?.specialization || "Specialization"}</p>
                  <label className="cursor-pointer">
                    <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                    <span className="text-sm text-royal hover:underline flex items-center gap-1 mt-1"><Upload className="h-3.5 w-3.5" /> Change Photo</span>
                  </label>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Full Name</Label>
                  <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label>Specialization</Label>
                  <Select value={form.specialization} onValueChange={(v) => setForm({ ...form, specialization: v })}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{specializations.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Qualifications</Label>
                  <Input value={form.qualifications} onChange={(e) => setForm({ ...form, qualifications: e.target.value })} placeholder="MBBS, MD..." className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label>Years of Experience</Label>
                  <Input type="number" value={form.experience_years} onChange={(e) => setForm({ ...form, experience_years: Number(e.target.value) })} className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91" className="h-10" />
                </div>
              </div>

              <Button onClick={save} disabled={saving} className="bg-royal hover:bg-royal/90 h-10">
                {saving ? "Saving..." : "Save Profile"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Clinic Tab */}
        <TabsContent value="clinic">
          <Card className="border-border/60 shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-teal" /> Clinic Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Clinic Name</Label>
                  <Input value={form.clinic_name} onChange={(e) => setForm({ ...form, clinic_name: e.target.value })} className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label>City</Label>
                  <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="h-10" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Full Address</Label>
                <Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={3} />
              </div>
              <Button onClick={save} disabled={saving} className="bg-royal hover:bg-royal/90 h-10">
                {saving ? "Saving..." : "Save Clinic Details"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Subscription Tab */}
        <TabsContent value="subscription">
          <Card className="border-border/60 shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Crown className="h-5 w-5 text-warning" /> Subscription</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-xl bg-secondary p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <Badge variant="secondary" className="capitalize text-sm font-semibold mb-2 bg-royal/10 text-royal">
                      {profile?.plan_status || "trial"} Plan
                    </Badge>
                    {profile?.plan_status === "trial" && (
                      <p className="text-sm text-muted-foreground mt-1">{daysLeft} day{daysLeft !== 1 ? "s" : ""} remaining in free trial</p>
                    )}
                  </div>
                  <Button className="bg-royal hover:bg-royal/90">Upgrade Plan</Button>
                </div>
                {profile?.plan_status === "trial" && (
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                      <span>Trial Progress</span>
                      <span>{Math.round(trialProgress)}%</span>
                    </div>
                    <Progress value={trialProgress} className="h-2.5 bg-border [&>div]:bg-royal" />
                  </div>
                )}
              </div>

              {/* Plan Comparison */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-border p-5">
                  <h3 className="font-heading font-bold text-foreground mb-1">Free Trial</h3>
                  <p className="text-sm text-muted-foreground mb-3">7 days, all features</p>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    {["Website Builder", "Appointment Booking", "Patient Records", "Blog (1 post)", "Basic Analytics"].map(f => (
                      <li key={f} className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-success" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border-2 border-royal p-5 relative">
                  <Badge className="absolute -top-2.5 right-4 bg-royal text-white text-[10px]">RECOMMENDED</Badge>
                  <h3 className="font-heading font-bold text-foreground mb-1">Pro Plan</h3>
                  <p className="text-sm text-muted-foreground mb-3">₹999/month</p>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    {["Everything in Free", "Unlimited Blogs", "AI Blog Writer", "WhatsApp Integration", "Priority Support", "Custom Domain"].map(f => (
                      <li key={f} className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-royal" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Account Tab */}
        <TabsContent value="account">
          <div className="space-y-6">
            <Card className="border-border/60 shadow-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Download className="h-5 w-5 text-royal" /> Export Data</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">Download a copy of your patient records and appointment history.</p>
                <Button variant="outline" onClick={() => toast.info("Export feature coming soon!")}>
                  <Download className="h-4 w-4 mr-2" /> Export All Data
                </Button>
              </CardContent>
            </Card>

            <Card className="border-border/60 shadow-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><LogOut className="h-5 w-5 text-muted-foreground" /> Session</CardTitle>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/5" onClick={handleLogout}>
                  <LogOut className="h-4 w-4 mr-2" /> Logout
                </Button>
              </CardContent>
            </Card>

            <Card className="border-destructive/30 shadow-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive"><Trash2 className="h-5 w-5" /> Danger Zone</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">Permanently delete your account and all associated data. This action cannot be undone.</p>
                <Button variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/5" onClick={() => toast.info("Please contact support to delete your account.")}>
                  <Trash2 className="h-4 w-4 mr-2" /> Delete Account
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SettingsPage;
