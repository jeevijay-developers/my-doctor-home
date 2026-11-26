import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { Practitioner } from "@/lib/practitioners/types";
import { practitionerErrorMessage } from "@/lib/practitioners/errors";
import { SLOT_DURATION_OPTIONS } from "@/lib/timeSlots";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { AmountInput } from "@/components/ui/amount-input";
import { DigitsInput } from "@/components/ui/digits-input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Same list as ProfilePage's specialization Select (kept local: ProfilePage does not export it).
const SPECIALIZATIONS = [
  "General Physician", "Cardiologist", "Dermatologist", "Orthopedic", "Pediatrician",
  "Gynecologist", "ENT Specialist", "Neurologist", "Psychiatrist", "Ophthalmologist",
  "Dentist", "Urologist", "Pulmonologist", "Gastroenterologist", "Oncologist",
  "Endocrinologist", "Nephrologist", "Rheumatologist", "Surgeon", "Other",
];

const CLINIC_DEFAULT = "default";
const NONE = "none";

type FormState = {
  display_name: string; specialization: string; qualifications: string; experience_years: string;
  registration_number: string; bio: string; consultation_fee: string; slot_duration_minutes: string;
  online_booking: boolean; directory_listed: boolean;
};

const toForm = (p: Practitioner | null): FormState => ({
  display_name: p?.display_name ?? "",
  specialization: p?.specialization ?? "",
  qualifications: p?.qualifications ?? "",
  experience_years: p?.experience_years != null ? String(p.experience_years) : "",
  registration_number: p?.registration_number ?? "",
  bio: p?.bio ?? "",
  consultation_fee: p?.consultation_fee != null ? String(p.consultation_fee) : "",
  slot_duration_minutes: p?.slot_duration_minutes != null ? String(p.slot_duration_minutes) : CLINIC_DEFAULT,
  online_booking: p?.online_booking ?? true,
  directory_listed: p?.directory_listed ?? true,
});

type RpcResult = { ok?: boolean; id?: string; error?: string } | null;

const messageFor = (code: string | null | undefined, fallback: string) =>
  practitionerErrorMessage(code) ?? (code === "INVALID" ? "Some values are not valid. Check them and try again." : fallback);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = add a new doctor. */
  practitioner: Practitioner | null;
  clinicId: string;
  /** The owner's own row: personal fields sync from Profile and are read-only here. */
  isOwnerRow: boolean;
  onSaved: () => void | Promise<void>;
}

const DoctorFormDialog = ({ open, onOpenChange, practitioner, clinicId, isOwnerRow, onSaved }: Props) => {
  const [form, setForm] = useState<FormState>(() => toForm(practitioner));
  const [photo, setPhoto] = useState<File | null>(null);
  const [signature, setSignature] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set when a NEW doctor was created but their photo/signature then failed to upload: the dialog
  // stays open and switches to editing that doctor, so a retry cannot create a second one ("dr-x-2").
  const [createdId, setCreatedId] = useState<{ id: string; name: string } | null>(null);
  const editingId = practitioner?.id ?? createdId?.id ?? null;

  useEffect(() => {
    if (!open) return;
    setForm(toForm(practitioner));
    setPhoto(null);
    setSignature(null);
    setError(null);
    setCreatedId(null);
    // Keyed on the id, not the object: a live refetch must not wipe what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, practitioner?.id]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const personalLocked = isOwnerRow || saving;

  const upsert = async (id: string | null, data: Record<string, unknown>): Promise<RpcResult | "error"> => {
    const { data: res, error: rpcError } = await supabase.rpc("upsert_practitioner", {
      _id: id as string, // null creates a new doctor
      _data: data as Json,
    });
    if (rpcError) {
      setError(messageFor(rpcError.message, "Could not save the doctor. Please try again."));
      return "error";
    }
    return res as RpcResult;
  };

  // Same pattern as ProfilePage: overwrite one path, then bust the browser cache with ?v=.
  const uploadFile = async (id: string, file: File, name: "photo" | "signature"): Promise<string | null> => {
    const ext = file.name.split(".").pop();
    const path = `${clinicId}/practitioners/${id}/${name}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("doctor-uploads").upload(path, file, { upsert: true });
    if (uploadError) {
      console.error(`Practitioner ${name} upload failed:`, uploadError);
      toast.error(`Upload failed: ${uploadError.message}`);
      return null;
    }
    const { data: { publicUrl } } = supabase.storage.from("doctor-uploads").getPublicUrl(path);
    return `${publicUrl}?v=${Date.now()}`;
  };

  const save = async () => {
    setError(null);
    if (!isOwnerRow && !form.display_name.trim()) {
      setError(practitionerErrorMessage("NAME_REQUIRED"));
      return;
    }
    const booking: Record<string, unknown> = {
      consultation_fee: form.consultation_fee.trim(),
      slot_duration_minutes: form.slot_duration_minutes === CLINIC_DEFAULT ? "" : form.slot_duration_minutes,
      online_booking: form.online_booking,
      directory_listed: form.directory_listed,
    };
    const data = isOwnerRow
      ? booking
      : {
          ...booking,
          display_name: form.display_name.trim(),
          specialization: form.specialization,
          qualifications: form.qualifications,
          experience_years: form.experience_years.trim(),
          registration_number: form.registration_number,
          bio: form.bio,
        };

    setSaving(true);
    try {
      const res = await upsert(editingId, data);
      if (res === "error") return;
      if (!res?.ok || !res.id) {
        setError(messageFor(res?.error, "Could not save the doctor. Please try again."));
        return;
      }
      // A new doctor has no id (and so no upload path) until upsert_practitioner returns it.
      if (!practitioner && !createdId) setCreatedId({ id: res.id, name: form.display_name.trim() });
      if (!isOwnerRow && (photo || signature)) {
        const urls: Record<string, string> = {};
        let uploadFailed = false;
        if (photo) {
          const url = await uploadFile(res.id, photo, "photo");
          if (url) urls.photo_url = url; else uploadFailed = true;
        }
        if (signature) {
          const url = await uploadFile(res.id, signature, "signature");
          if (url) urls.signature_url = url; else uploadFailed = true;
        }
        let attachFailed = false;
        if (Object.keys(urls).length) {
          const again = await upsert(res.id, urls);
          if (again === "error" || !again?.ok) attachFailed = true;
          else {
            // Attached: only what is still missing is retried.
            if (urls.photo_url) setPhoto(null);
            if (urls.signature_url) setSignature(null);
          }
        }
        if (uploadFailed || attachFailed) {
          // The doctor itself is saved: refresh the list, but keep the dialog open on this doctor
          // so the photo / signature can be retried.
          await onSaved();
          setError("The doctor was saved, but the photo or signature could not be uploaded. Choose the file again and press Save to retry.");
          return;
        }
      }
      toast.success(practitioner || createdId ? "Doctor updated" : "Doctor added");
      await onSaved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{practitioner ? `Edit ${practitioner.display_name}` : createdId ? `Edit ${createdId.name}` : "Add doctor"}</DialogTitle>
          <DialogDescription>
            {editingId ? "Change this doctor's details and booking settings." : "Add a doctor who sees patients at your clinic."}
          </DialogDescription>
        </DialogHeader>

        {isOwnerRow && (
          <p className="text-sm rounded-lg bg-secondary p-3">
            Edit your name, photo and signature in Profile.{" "}
            <Link to="/admin/profile" className="text-royal font-medium underline-offset-2 hover:underline">Open Profile</Link>
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="doc-name">Name *</Label>
            <Input id="doc-name" value={form.display_name} onChange={(e) => set("display_name", e.target.value)}
              placeholder="Dr. Full Name" disabled={personalLocked} maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doc-spec">Specialization</Label>
            <Select value={form.specialization || NONE} onValueChange={(v) => set("specialization", v === NONE ? "" : v)} disabled={personalLocked}>
              <SelectTrigger id="doc-spec" className="h-10"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not set</SelectItem>
                {/* Keep a value saved before the list changed selectable. */}
                {form.specialization && !SPECIALIZATIONS.includes(form.specialization) && (
                  <SelectItem value={form.specialization}>{form.specialization}</SelectItem>
                )}
                {SPECIALIZATIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doc-qual">Qualifications</Label>
            <Input id="doc-qual" value={form.qualifications} onChange={(e) => set("qualifications", e.target.value)}
              placeholder="MBBS, MD" disabled={personalLocked} maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doc-exp">Experience (years)</Label>
            <DigitsInput id="doc-exp" maxLength={2} value={form.experience_years}
              onChange={(e) => set("experience_years", e.target.value)} disabled={personalLocked} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doc-reg">Registration number</Label>
            <Input id="doc-reg" value={form.registration_number} onChange={(e) => set("registration_number", e.target.value)}
              disabled={personalLocked} maxLength={60} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="doc-bio">Bio</Label>
            <Textarea id="doc-bio" rows={3} value={form.bio} onChange={(e) => set("bio", e.target.value)}
              disabled={personalLocked} maxLength={2000} />
          </div>
          {!isOwnerRow && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="doc-photo">Photo</Label>
                <Input id="doc-photo" type="file" accept="image/*" disabled={saving}
                  onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="doc-sign">Signature</Label>
                <Input id="doc-sign" type="file" accept="image/*" disabled={saving}
                  onChange={(e) => setSignature(e.target.files?.[0] ?? null)} />
              </div>
            </>
          )}

          <div className="sm:col-span-2 border-t pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Booking</div>
          <div className="space-y-1.5">
            <Label htmlFor="doc-fee">Consultation fee (₹)</Label>
            <AmountInput id="doc-fee" value={form.consultation_fee} onChange={(e) => set("consultation_fee", e.target.value)}
              placeholder="Clinic fee" disabled={saving} />
            <p className="text-[11px] text-muted-foreground">Leave blank to use the clinic fee.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doc-slot">Appointment length</Label>
            <Select value={form.slot_duration_minutes} onValueChange={(v) => set("slot_duration_minutes", v)} disabled={saving}>
              <SelectTrigger id="doc-slot" className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={CLINIC_DEFAULT}>Clinic default</SelectItem>
                {SLOT_DURATION_OPTIONS.map((m) => <SelectItem key={m} value={String(m)}>{m} minutes</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg bg-secondary p-3">
            <Label htmlFor="doc-online">Online booking</Label>
            <Switch id="doc-online" checked={form.online_booking} onCheckedChange={(v) => set("online_booking", v)} disabled={saving} />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg bg-secondary p-3">
            <Label htmlFor="doc-dir">Show in directory</Label>
            <Switch id="doc-dir" checked={form.directory_listed} onCheckedChange={(v) => set("directory_listed", v)} disabled={saving} />
          </div>
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button className="bg-royal hover:bg-royal/90" onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DoctorFormDialog;
