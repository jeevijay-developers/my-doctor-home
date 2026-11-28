import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { User, MapPin, Upload, UserCircle, Building2 } from "lucide-react";
import DoctorPaymentOnboarding from "./DoctorPaymentOnboarding";
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
import { toast } from "sonner";
import { isValidIndianPhone, normalizeIndianPhone, phoneErrorMessage } from "@/lib/phone";
import { INDIAN_STATES } from "@/lib/formatClinicLocation";
import { getCitiesForState } from "@/lib/indiaStatesCities";
import { isGoogleMapsUrl } from "@/lib/googleMapsUrl";
import { sanitizeBio } from "@/lib/doctorBio";
import BioAssistant from "./BioAssistant";


const specializations = [
  "General Physician", "Cardiologist", "Dermatologist", "Orthopedic", "Pediatrician",
  "Gynecologist", "ENT Specialist", "Neurologist", "Psychiatrist", "Ophthalmologist",
  "Dentist", "Urologist", "Pulmonologist", "Gastroenterologist", "Oncologist",
  "Endocrinologist", "Nephrologist", "Rheumatologist", "Surgeon", "Other",
];

interface ProfilePageProps {
  /**
   * "multi" is for owners of a 2+ doctor clinic: the same fields, regrouped into a Clinic card and a
   * My doctor profile card, with a note on where each shows on the public site. Nothing about what is
   * saved changes. Default "single" renders exactly as before.
   */
  variant?: "single" | "multi";
}

const ProfilePage = ({ variant = "single" }: ProfilePageProps = {}) => {
  const multi = variant === "multi";
  const { profile, refetch, can } = useProfile();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: "", specialization: "", qualifications: "", experience_years: 0,
    phone: "", clinic_name: "", city: "", state: "", address: "",
    consultation_fee: 0, gstin: "", gst_registered: false,
    registration_number: "", clinic_email: "",
    locality: "", pincode: "", directory_listed: true, google_maps_url: "", bio: "",
  });
  // Service names (first few) feed the bio helpers. Failure just means no services in the draft.
  const [serviceNames, setServiceNames] = useState<string[]>([]);

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
        locality: (profile as any).locality || "",
        pincode: (profile as any).pincode || "",
        directory_listed: (profile as any).directory_listed !== false,
        google_maps_url: (profile as any).google_maps_url || "",
        bio: (profile as any).bio || "",
      });
    }
  }, [profile]);

  const profileId = profile?.id;
  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.from("services").select("name").eq("doctor_id", profileId).eq("active", true).order("sort_order");
        if (!cancelled && Array.isArray(data)) setServiceNames(data.map((r: any) => String(r?.name ?? "")).filter(Boolean).slice(0, 6));
      } catch { /* optional context only */ }
    })();
    return () => { cancelled = true; };
  }, [profileId]);


  // Keep a legacy free-text city selectable so existing profiles don't silently lose it.
  const cityOptions = useMemo(() => {
    const list = getCitiesForState(form.state);
    return form.city && !list.includes(form.city) ? [form.city, ...list] : list;
  }, [form.state, form.city]);

  const generateSlug = (name: string) =>
    name.toLowerCase().trim().replace(/^dr\.?\s*/i, "dr-").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  const save = async () => {
    if (!profile) return;
    if (form.experience_years < 0) { toast.error("Years of experience cannot be negative."); return; }
    if (form.consultation_fee < 0) { toast.error("Consultation fee cannot be negative."); return; }
    if (form.phone && !isValidIndianPhone(form.phone)) { toast.error(phoneErrorMessage); return; }
    const pincode = form.pincode.trim();
    if (pincode && !/^[1-9][0-9]{5}$/.test(pincode)) { toast.error("Enter a valid 6-digit pincode."); return; }
    const mapsUrl = form.google_maps_url.trim();
    if (mapsUrl && !isGoogleMapsUrl(mapsUrl)) { toast.error("Enter a valid Google Maps link (it should start with https://)."); return; }
    setSaving(true);
    // Directory fields are saved in a second update (below) so a database that has not
    // been migrated yet can never block the rest of the profile from saving.
    const { locality, pincode: _pincode, directory_listed, google_maps_url: _maps, ...core } = form;
    const payload: any = { ...core, bio: sanitizeBio(form.bio) || null, phone: form.phone ? normalizeIndianPhone(form.phone) : form.phone };

    // BUG-M05: keep public URL slug in sync when the doctor's name changes.
    // A clinic that picked its own address (set automatically when a second doctor was added) keeps it: never re-derive.
    if (!(profile as any).slug_locked && form.full_name && form.full_name !== (profile as any).full_name) {
      let slug = generateSlug(form.full_name);
      if (slug && slug !== (profile as any).slug) {
        const { data: clash } = await supabase.from("profiles").select("id").eq("slug", slug).neq("id", profile.id).maybeSingle();
        if (clash) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
        payload.slug = slug;
      }
    }

    // The database records the old address in slug_history (trigger); if it refuses the new one
    // (e.g. it is another clinic's old address), save everything else and keep the current address.
    let { error } = await supabase.from("profiles").update(payload).eq("id", profile.id);
    if (error && payload.slug && /SLUG_(TAKEN|INVALID|RESERVED)/.test(error.message)) {
      delete payload.slug;
      ({ error } = await supabase.from("profiles").update(payload).eq("id", profile.id));
    }
    if (error) { setSaving(false); toast.error("Could not save profile"); return; }
    const { error: dirError } = await supabase
      .from("profiles")
      .update({ locality: locality.trim() || null, pincode: pincode || null, directory_listed, google_maps_url: mapsUrl || null } as any)
      .eq("id", profile.id);
    setSaving(false);
    if (dirError) {
      console.warn("Directory fields not saved", dirError.message);
      toast.warning("Profile saved, but location/directory settings could not be saved yet.");
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

  const phoneField = (
<div className="space-y-1.5">
              <Label>{multi ? "Clinic phone" : "Phone"}</Label>
              <PhoneInput value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="10-digit mobile" className="h-10" />
              {form.phone && !isValidIndianPhone(form.phone) && (
                <p className="text-[11px] text-destructive">{phoneErrorMessage}</p>
              )}
            </div>
  );

  const personalCard = (
    <Card className="border-border/60 shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><User className="h-5 w-5 text-royal" aria-hidden="true" /> {multi ? "My doctor profile" : "Your Details"}</CardTitle>
        {multi && (
          <p className="text-sm text-muted-foreground">
            Shown on your doctor page and on your prescriptions. Write your bio below: at least 60 characters lets Google list your page.
          </p>
        )}
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
          {!multi && phoneField}
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

        <BioAssistant
          idPrefix="profile"
          value={form.bio}
          onChange={(bio) => setForm((f) => ({ ...f, bio }))}
          disabled={!can("profile.edit")}
          helpText="Shown on your public doctor page. Plain text only."
          context={{
            name: form.full_name, specialization: form.specialization, qualifications: form.qualifications,
            experience: form.experience_years, clinicName: form.clinic_name, locality: form.locality, city: form.city,
            services: serviceNames,
          }}
        />

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
  );

  const clinicCard = (
      <Card className="border-border/60 shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">{multi ? <Building2 className="h-5 w-5 text-teal" aria-hidden="true" /> : <MapPin className="h-5 w-5 text-teal" />} {multi ? "Clinic" : "Clinic Details"}</CardTitle>
          {multi && (
            <p className="text-sm text-muted-foreground">
              Shown on the clinic page and in search results: the clinic name, address, phone and email.
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Clinic Name</Label>
              <Input value={form.clinic_name} onChange={(e) => setForm({ ...form, clinic_name: e.target.value })} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label>State</Label>
              <Select
                value={form.state}
                onValueChange={(v) =>
                  setForm({ ...form, state: v, city: getCitiesForState(v).includes(form.city) ? form.city : "" })
                }
              >
                <SelectTrigger className="h-10"><SelectValue placeholder="Select State" /></SelectTrigger>
                <SelectContent>
                  {INDIAN_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>City</Label>
              {/* A dropdown (not free text) so "Kota", "kota " and "Kota, Rajasthan" can't split the doctor directory into separate city pages. */}
              <Select value={form.city} onValueChange={(v) => setForm({ ...form, city: v })} disabled={cityOptions.length === 0}>
                <SelectTrigger className="h-10"><SelectValue placeholder={form.state ? "Select City" : "Select a state first"} /></SelectTrigger>
                <SelectContent>
                  {cityOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Area / Locality</Label>
              <Input value={form.locality} onChange={(e) => setForm({ ...form, locality: e.target.value })} placeholder="e.g. Talwandi" className="h-10" maxLength={80} />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Pincode</Label>
              <Input value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })} inputMode="numeric" placeholder="6-digit pincode" className="h-10" />
            </div>
          </div>
          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div>
              <Label htmlFor="directory-listed">List me in the Doctylia doctor directory</Label>
              <p className="text-[11px] text-muted-foreground mt-1">Show my profile in the Doctylia doctor directory and my published articles on the Health Articles page. Lets patients find you by name, specialty and city at doctylia.com/doctors. Your own website stays online either way.</p>
            </div>
            <Switch id="directory-listed" checked={form.directory_listed} onCheckedChange={(v) => setForm({ ...form, directory_listed: v })} />
          </div>
          <div className="space-y-1.5">
            <Label>Full Address</Label>
            <Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label>Google Maps / Business Profile link</Label>
            <Input
              value={form.google_maps_url}
              onChange={(e) => setForm({ ...form, google_maps_url: e.target.value })}
              placeholder="https://maps.app.goo.gl/..."
              className="h-10"
              maxLength={500}
            />
            {form.google_maps_url.trim() && !isGoogleMapsUrl(form.google_maps_url) && (
              <p className="text-[11px] text-destructive">Enter a Google Maps link starting with https://</p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Open your clinic on Google Maps, click Share, then Copy link. Helps patients find your clinic and helps Google connect it to your website. Optional.
            </p>
          </div>
          {multi && phoneField}
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
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="font-heading font-bold text-2xl text-primary flex items-center gap-2">
        <UserCircle className="h-6 w-6 text-royal" /> {multi ? "Clinic & Doctor Profile" : "Doctor Profile"}
      </h1>

      {multi ? clinicCard : personalCard}

      {multi ? personalCard : clinicCard}

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
