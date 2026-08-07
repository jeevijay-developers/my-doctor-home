import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { User, MapPin, Upload, UserCircle, ArrowRight, CheckCircle2, Circle, Landmark, Smartphone, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { isValidIndianPhone, normalizeIndianPhone, phoneErrorMessage } from "@/lib/phone";
import type { Tables } from "@/integrations/supabase/types";

type BankAccount = Tables<"doctor_bank_accounts">;

const specializations = [
  "General Physician", "Cardiologist", "Dermatologist", "Orthopedic", "Pediatrician",
  "Gynecologist", "ENT Specialist", "Neurologist", "Psychiatrist", "Ophthalmologist",
  "Dentist", "Urologist", "Pulmonologist", "Gastroenterologist", "Oncologist",
  "Endocrinologist", "Nephrologist", "Rheumatologist", "Surgeon", "Other",
];

const ProfilePage = () => {
  const { profile, refetch } = useProfile();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: "", specialization: "", qualifications: "", experience_years: 0,
    phone: "", clinic_name: "", city: "", address: "",
    consultation_fee: 0, gstin: "", gst_registered: false,
  });
  const [servicesCount, setServicesCount] = useState(0);
  const [blogCount, setBlogCount] = useState(0);
  const [dashboardReady, setDashboardReady] = useState(false);

  // Bank / UPI Setup — used to pay out the doctor's share of online consultation
  // payments (moved here from the removed Earnings section; same edge function,
  // same validation/backend logic, only the location changed).
  const [bank, setBank] = useState<BankAccount | null>(null);
  const [payMethod, setPayMethod] = useState<"bank" | "upi">("bank");
  const [accountHolderName, setAccountHolderName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [upiId, setUpiId] = useState("");
  const [savingBank, setSavingBank] = useState(false);

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
        consultation_fee: (profile as any).consultation_fee || 0,
        gstin: (profile as any).gstin || "",
        gst_registered: Boolean((profile as any).gst_registered),
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

  const loadBankDetails = async () => {
    if (!profile) return;
    const { data } = await supabase.from("doctor_bank_accounts").select("*").eq("doctor_id", profile.id).maybeSingle();
    setBank(data || null);
    if (data) {
      setAccountHolderName(data.account_holder_name || "");
      setAccountNumber(data.account_number || "");
      setIfsc(data.ifsc || "");
      setUpiId(data.upi_id || "");
      setPayMethod(data.upi_id ? "upi" : "bank");
    }
  };

  useEffect(() => { loadBankDetails(); }, [profile]);

  const saveBankDetails = async () => {
    if (!profile) return;
    if (payMethod === "bank" && (!accountNumber.trim() || !ifsc.trim())) {
      toast.error("Enter both account number and IFSC code.");
      return;
    }
    if (payMethod === "upi" && !upiId.trim()) {
      toast.error("Enter a valid UPI ID.");
      return;
    }
    setSavingBank(true);
    const { data, error } = await supabase.functions.invoke("add-doctor-bank-account", {
      body: payMethod === "bank"
        ? { account_holder_name: accountHolderName || undefined, account_number: accountNumber.trim(), ifsc: ifsc.trim() }
        : { account_holder_name: accountHolderName || undefined, upi_id: upiId.trim() },
    });
    setSavingBank(false);
    if (error || !data?.ok) {
      toast.error("Couldn't save payout details. Please try again.");
      return;
    }
    toast.success(data.note ? "Payout details saved" : "Payout details saved & linked to Razorpay", {
      description: data.note,
    });
    loadBankDetails();
  };

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
    const { error } = await supabase.storage.from("doctor-uploads").upload(path, file, { upsert: true });
    if (error) { toast.error("Upload failed: " + error.message); return; }
    const { data: { publicUrl } } = supabase.storage.from("doctor-uploads").getPublicUrl(path);
    await supabase.from("profiles").update({ profile_photo_url: publicUrl }).eq("id", profile.id);
    refetch();
    toast.success("Photo updated");
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
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="10-digit mobile" className="h-10" />
              {form.phone && !isValidIndianPhone(form.phone) && (
                <p className="text-[11px] text-destructive">{phoneErrorMessage}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Default Consultation Fee (₹)</Label>
              <Input type="number" min={0} value={form.consultation_fee}
                onChange={(e) => setForm({ ...form, consultation_fee: Number(e.target.value) })}
                placeholder="500" className="h-10" />
              <p className="text-[11px] text-muted-foreground">Used as a fallback when a service doesn't set its own price.</p>
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
          <div className="space-y-1.5">
            <Label>Full Address</Label>
            <Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={3} />
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

          {/* Bank / UPI Setup — moved here from the removed Earnings section.
              Used to pay out the doctor's share of online consultation payments. */}
          <div className="rounded-xl border border-border p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Landmark className="h-4 w-4 text-royal" />
                <Label className="text-sm font-semibold">Bank / UPI Setup</Label>
              </div>
              {bank && (
                <Badge variant="outline" className={`text-[10px] ${bank.verified ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
                  {bank.verified ? "Linked to Razorpay" : "Saved — linking pending"}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              Used to pay out your share of online consultation payments collected via Doctylia.
            </p>

            <div className="flex gap-2">
              <Button type="button" size="sm" variant={payMethod === "bank" ? "default" : "outline"}
                className={payMethod === "bank" ? "bg-royal hover:bg-royal/90" : ""}
                onClick={() => setPayMethod("bank")}>
                <Landmark className="h-3.5 w-3.5 mr-1.5" /> Bank Account
              </Button>
              <Button type="button" size="sm" variant={payMethod === "upi" ? "default" : "outline"}
                className={payMethod === "upi" ? "bg-royal hover:bg-royal/90" : ""}
                onClick={() => setPayMethod("upi")}>
                <Smartphone className="h-3.5 w-3.5 mr-1.5" /> UPI
              </Button>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Account Holder Name</Label>
                <Input value={accountHolderName} onChange={(e) => setAccountHolderName(e.target.value)}
                  placeholder="As per bank/UPI records" className="h-10" />
              </div>

              {payMethod === "bank" ? (
                <>
                  <div className="space-y-1.5">
                    <Label>Account Number</Label>
                    <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="e.g. 000123456789" className="h-10" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>IFSC Code</Label>
                    <Input value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase())} placeholder="e.g. HDFC0001234" className="h-10 font-mono uppercase" />
                  </div>
                </>
              ) : (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>UPI ID</Label>
                  <Input value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="yourname@bank" className="h-10" />
                </div>
              )}
            </div>

            <div className="p-3 rounded-xl bg-warning/10 border border-warning/20 text-xs text-warning-foreground/80 flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-warning" />
              <span>Payouts will only start flowing once the Doctylia team activates the platform's RazorpayX account. Your details are saved securely either way.</span>
            </div>

            <div className="flex justify-end">
              <Button onClick={saveBankDetails} disabled={savingBank} className="bg-royal hover:bg-royal/90 text-white h-10">
                {savingBank ? "Saving..." : "Save Payout Details"}
              </Button>
            </div>
          </div>
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

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="bg-royal hover:bg-royal/90 h-10 min-w-[160px]">
          {saving ? "Saving..." : "Save Profile"}
        </Button>
      </div>
    </div>
  );
};

export default ProfilePage;
