import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { User, MapPin, Upload, UserCircle, ArrowRight, CheckCircle2, Circle } from "lucide-react";
import DoctorPaymentOnboarding from "./DoctorPaymentOnboarding";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { DigitsInput } from "@/components/ui/digits-input";
import { AmountInput } from "@/components/ui/amount-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { isValidIndianPhone, normalizeIndianPhone, phoneErrorMessage } from "@/lib/phone";
import { INDIAN_STATES } from "@/lib/formatClinicLocation";


const specializations = [
  "General Physician", "Cardiologist", "Dermatologist", "Orthopedic", "Pediatrician",
  "Gynecologist", "ENT Specialist", "Neurologist", "Psychiatrist", "Ophthalmologist",
  "Dentist", "Urologist", "Pulmonologist", "Gastroenterologist", "Oncologist",
  "Endocrinologist", "Nephrologist", "Rheumatologist", "Surgeon", "Other",
];

const ProfilePage = () => {
  const { profile, refetch, can } = useProfile();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: "", specialization: "", qualifications: "", experience_years: 0,
    phone: "", clinic_name: "", city: "", state: "", address: "",
    consultation_fee: 0, gstin: "", gst_registered: false,
    registration_number: "", clinic_email: "",
  });
  const [servicesCount, setServicesCount] = useState(0);
  const [blogCount, setBlogCount] = useState(0);
  const [dashboardReady, setDashboardReady] = useState(false);



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
        state: profile.state || "",
        address: profile.address || "",
        consultation_fee: (profile as any).consultation_fee || 0,
        gstin: (profile as any).gstin || "",
        gst_registered: Boolean((profile as any).gst_registered),
        registration_number: profile.registration_number || "",
        clinic_email: profile.clinic_email || "",
      });
    }
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    const id = profile.id;
    Promise.all([
      supabase.from("services").select("id", { count: "exact", head: true }).eq("doctor_id", id).eq("active", true),
      supabase.from("blog_posts").select("id", { count: "exact", head: true }).eq("doctor_id", id).eq("is_published", true),
    ]).then(([svcRes, blogRes]) => {
      setServicesCount(svcRes.count || 0);
      setBlogCount(blogRes.count || 0);
      setDashboardReady(true);
    });
  }, [profile]);



  const checklist = [
    { label: "Complete your profile", done: !!profile?.full_name && !!profile?.specialization, href: "/admin/settings" },
    { label: "Add your services", done: servicesCount > 0, href: "/admin/my-website" },
    { label: "Set working hours", done: true, href: "/admin/my-website" },
    { label: "Publish your website", done: !!profile?.onboarding_completed, href: "/admin/my-website" },
    { label: "Write your first blog", done: blogCount > 0, href: "/admin/blog" },
  ];
  const completedSteps = checklist.filter((c) => c.done).length;

  const generateSlug = (name: string) =>
    name.toLowerCase().trim().replace(/^dr\.?\s*/i, "dr-").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  const save = async () => {
    if (!profile) return;
    if (form.experience_years < 0) { toast.error("Years of experience cannot be negative."); return; }
    if (form.consultation_fee < 0) { toast.error("Consultation fee cannot be negative."); return; }
    if (form.phone && !isValidIndianPhone(form.phone)) { toast.error(phoneErrorMessage); return; }
    setSaving(true);
    const payload: any = { ...form, phone: form.phone ? normalizeIndianPhone(form.phone) : form.phone };

    // BUG-M05: keep public URL slug in sync when the doctor's name changes.
    let oldSlugToArchive: string | null = null;
    if (form.full_name && form.full_name !== (profile as any).full_name) {
      let slug = generateSlug(form.full_name);
      if (slug && slug !== (profile as any).slug) {
        const { data: clash } = await supabase.from("profiles").select("id").eq("slug", slug).neq("id", profile.id).maybeSingle();
        if (clash) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
        payload.slug = slug;
        oldSlugToArchive = (profile as any).slug || null;
      }
    }

    const { error } = await supabase.from("profiles").update(payload).eq("id", profile.id);
    setSaving(false);
    if (error) { toast.error("Could not save profile"); return; }
    // Archive old slug so old URLs keep working via redirect.
    if (oldSlugToArchive && payload.slug) {
      await supabase.from("slug_history" as any).insert({ doctor_id: profile.id, old_slug: oldSlugToArchive });
    }
    refetch();
    toast.success(payload.slug ? `Profile saved. New URL: /dr/${payload.slug}` : "Profile saved");
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    const ext = file.name.split(".").pop();
    const path = `${profile.id}/profile.${ext}`;
    const { error: uploadError } = await supabase.storage.from("doctor-uploads").upload(path, file, { upsert: true });
    if (uploadError) {
      console.error("Profile photo upload failed:", uploadError);
      toast.error("Upload failed: " + uploadError.message);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from("doctor-uploads").getPublicUrl(path);
    // `upsert: true` overwrites the same storage path, so re-uploading with the
    // same file extension produces an identical URL — browsers then keep
    // serving the old cached image even though the file changed. A cache-busting
    // query param forces every replacement to be treated as a new resource.
    const versionedUrl = `${publicUrl}?v=${Date.now()}`;
    const { error: updateError } = await supabase.from("profiles").update({ profile_photo_url: versionedUrl }).eq("id", profile.id);
    if (updateError) {
      console.error("Profile photo DB update failed:", updateError);
      toast.error("Photo uploaded, but couldn't save it to your profile. Please try again.");
      return;
    }
    await refetch();
    toast.success("Profile picture updated successfully");
  };

  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    const ext = file.name.split(".").pop();
    const path = `${profile.id}/signature.${ext}`;
    const { error: uploadError } = await supabase.storage.from("doctor-uploads").upload(path, file, { upsert: true });
    if (uploadError) {
      console.error("Signature upload failed:", uploadError);
      toast.error("Upload failed: " + uploadError.message);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from("doctor-uploads").getPublicUrl(path);
    const versionedUrl = `${publicUrl}?v=${Date.now()}`;
    const { error: updateError } = await supabase.from("profiles").update({ signature_url: versionedUrl }).eq("id", profile.id);
    if (updateError) {
      console.error("Signature DB update failed:", updateError);
      toast.error("Signature uploaded, but couldn't save it to your profile. Please try again.");
      return;
    }
    await refetch();
    toast.success("Signature updated successfully");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="font-heading font-bold text-2xl text-primary flex items-center gap-2">
        <UserCircle className="h-6 w-6 text-royal" /> Doctor Profile
      </h1>

      <Card className="border-border/60 shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><User className="h-5 w-5 text-royal" /> Your Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-5">
            <div className="relative group">
              <div className="w-24 h-24 rounded-2xl bg-secondary flex items-center justify-center overflow-hidden border-2 border-border p-1">
                {profile?.profile_photo_url ? (
                  <img src={profile.profile_photo_url} alt="Profile" className="max-w-full max-h-full w-auto h-auto object-contain rounded-xl" />
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
              <DigitsInput maxLength={2} value={String(form.experience_years ?? "")} onChange={(e) => setForm({ ...form, experience_years: e.target.value === "" ? 0 : Number(e.target.value) })} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <PhoneInput value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="10-digit mobile" className="h-10" />
              {form.phone && !isValidIndianPhone(form.phone) && (
                <p className="text-[11px] text-destructive">{phoneErrorMessage}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Default Consultation Fee (₹)</Label>
              <AmountInput value={form.consultation_fee === 0 ? "" : form.consultation_fee}
                onChange={(e) => setForm({ ...form, consultation_fee: e.target.value === "" ? 0 : Number(e.target.value) })}
                placeholder="500" className="h-10" />
              <p className="text-[11px] text-muted-foreground">Used as a fallback when a service doesn't set its own price.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Medical Registration Number</Label>
              <Input value={form.registration_number} onChange={(e) => setForm({ ...form, registration_number: e.target.value })}
                placeholder="e.g. MCI-12345" className="h-10" />
              <p className="text-[11px] text-muted-foreground">Shown on prescriptions, near your signature.</p>
            </div>
          </div>

          <div className="flex items-center gap-5 pt-1">
            <div className="relative group">
              <div className="w-24 h-14 rounded-xl bg-secondary flex items-center justify-center overflow-hidden border-2 border-border">
                {profile?.signature_url ? (
                  <img src={profile.signature_url} alt="Signature" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-[10px] text-muted-foreground px-2 text-center">No signature</span>
                )}
              </div>
              <label className="absolute inset-0 bg-black/40 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer flex items-center justify-center">
                <input type="file" accept="image/*" className="hidden" onChange={handleSignatureUpload} />
                <Upload className="h-4 w-4 text-white" />
              </label>
            </div>
            <div>
              <p className="font-medium text-sm text-foreground">Signature Image</p>
              <p className="text-xs text-muted-foreground">Used on your prescriptions. Optional.</p>
              <label className="cursor-pointer">
                <input type="file" accept="image/*" className="hidden" onChange={handleSignatureUpload} />
                <span className="text-sm text-royal hover:underline flex items-center gap-1 mt-1"><Upload className="h-3.5 w-3.5" /> {profile?.signature_url ? "Change Signature" : "Upload Signature"}</span>
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

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
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>State</Label>
              <Select value={form.state} onValueChange={(v) => setForm({ ...form, state: v })}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Select State" /></SelectTrigger>
                <SelectContent>
                  {INDIAN_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Full Address</Label>
            <Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label>Clinic Email</Label>
            <Input type="email" value={form.clinic_email} onChange={(e) => setForm({ ...form, clinic_email: e.target.value })}
              placeholder="clinic@example.com" className="h-10" />
            <p className="text-[11px] text-muted-foreground">Shown on prescriptions and other clinic documents. Optional.</p>
          </div>

          <div className="rounded-xl border border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-semibold">GST Registered</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Show GST breakup on invoices</p>
              </div>
              <Switch checked={form.gst_registered} onCheckedChange={(v) => setForm({ ...form, gst_registered: v })} />
            </div>
            {form.gst_registered && (
              <div className="space-y-1.5">
                <Label>GSTIN</Label>
                <Input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
                  placeholder="22ABCDE1234F1Z5" className="h-10 font-mono uppercase" />
              </div>
            )}
          </div>

          {/* Online Payments — Razorpay Route linked account onboarding */}
          {profile && can("profile.edit") && (
            <DoctorPaymentOnboarding
              profile={{
                id: profile.id,
                full_name: profile.full_name,
                phone: profile.phone,
                clinic_email: profile.clinic_email,
                razorpay_account_id: profile.razorpay_account_id,
                razorpay_account_status: profile.razorpay_account_status,
                razorpay_payment_enabled: profile.razorpay_payment_enabled,
                razorpay_onboarding_error: profile.razorpay_onboarding_error,
              }}
              onStatusChange={refetch}
            />
          )}
        </CardContent>
      </Card>

      {/* Getting Started — moved here from the dashboard, only until all tasks are done */}
      {dashboardReady && completedSteps < checklist.length && (
        <Card className="border-0 rounded-2xl shadow-sm bg-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Getting Started</CardTitle>
              <span className="text-xs font-semibold text-royal">{completedSteps}/{checklist.length}</span>
            </div>
            <Progress value={(completedSteps / checklist.length) * 100} className="h-2 mt-2 bg-secondary [&>div]:bg-royal" />
          </CardHeader>
          <CardContent className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {checklist.map((item) => (
              <Link key={item.label} to={item.href} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-secondary/60 transition-colors group">
                {item.done ? (
                  <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground/30 flex-shrink-0 group-hover:text-royal" />
                )}
                <span className={`text-sm ${item.done ? "text-muted-foreground line-through" : "text-foreground font-medium"}`}>{item.label}</span>
                {!item.done && <ArrowRight className="h-3 w-3 text-muted-foreground/40 ml-auto" />}
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {can("profile.edit") && (
      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="bg-royal hover:bg-royal/90 h-10 min-w-[160px]">
          {saving ? "Saving..." : "Save Profile"}
        </Button>
      </div>
      )}
    </div>
  );
};

export default ProfilePage;
