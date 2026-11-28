import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Circle, ExternalLink, Loader2, UserCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import BioAssistant from "./BioAssistant";
import { useProfile } from "@/hooks/useProfile";
import { usePractitioners } from "@/hooks/usePractitioners";
import {
  MIN_INDEXABLE_BIO_CHARS, bioLength, completenessChipLabel, notIndexableNote, practitionerCompleteness, practitionerPublicPath,
} from "@/lib/profileCompleteness";
import { Badge } from "@/components/ui/badge";

// What a doctor login sees under Settings. The clinic profile (ProfilePage) is the OWNER's own
// name, phone, registration number and GSTIN, so showing it to the second doctor as "Your Details"
// would present someone else's identity as theirs. This card shows their own doctor record. They
// may change only their bio, photo and signature (update_my_practitioner_profile, own row only);
// the owner edits everything else from the Doctors page.
const BIO_MAX = 2000;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

const Row = ({ label, value }: { label: string; value: string | number | null | undefined }) => (
  <div>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-sm font-medium text-foreground">{value === null || value === undefined || value === "" ? "Not set" : value}</p>
  </div>
);

/** Returns a message when the file cannot be used, otherwise null. */
export const imageFileProblem = (file: File): string | null => {
  if (!IMAGE_EXT[file.type]) return "Choose a JPG, PNG or WebP image.";
  if (file.size > IMAGE_MAX_BYTES) return "The image is larger than 5 MB.";
  return null;
};

const MyDoctorDetailsCard = () => {
  const { profile, myPractitionerId, staffName } = useProfile();
  const { byId, refetch, active } = usePractitioners();
  const me = myPractitionerId ? byId(myPractitionerId) : undefined;
  const activeCount = (active ?? []).length;
  const clinicSlug = (profile as { slug?: string | null } | null)?.slug ?? null;
  const publicPath = me ? practitionerPublicPath({ clinicSlug, doctorSlug: me.slug, isActive: me.is_active, activeDoctors: activeCount }) : null;
  const completeness = me ? practitionerCompleteness(me) : null;
  const OWNER_MANAGED = new Set(["specialization", "qualifications", "experience", "fee", "registration"]);
  const youCanAdd = [
    ...(completeness?.missing.filter((m) => !OWNER_MANAGED.has(m.key)).map((m) => m.label) ?? []),
    ...(me && !me.signature_url ? ["Add a signature (used on your prescriptions)"] : []),
  ];
  const ownerToAdd = completeness?.missing.filter((m) => OWNER_MANAGED.has(m.key)).map((m) => m.label) ?? [];
  const clinicId = profile?.id;

  const [bio, setBio] = useState(me?.bio ?? "");
  const bioChars = bioLength(bio);
  const bioNeeded = Math.max(0, MIN_INDEXABLE_BIO_CHARS - bioChars);
  const [photo, setPhoto] = useState<File | null>(null);
  const [signature, setSignature] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Keyed on the id: a live refetch must not wipe what is being typed.
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (me && loadedFor.current !== me.id) {
      loadedFor.current = me.id;
      setBio(me.bio ?? "");
    }
  }, [me]);

  const upload = async (file: File, name: "photo" | "signature"): Promise<string | null> => {
    const path = `${clinicId}/practitioners/${myPractitionerId}/${name}.${IMAGE_EXT[file.type]}`;
    const { error: uploadError } = await supabase.storage.from("doctor-uploads").upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) {
      console.error(`Doctor ${name} upload failed:`, uploadError);
      return null;
    }
    const { data: { publicUrl } } = supabase.storage.from("doctor-uploads").getPublicUrl(path);
    // Same path on every upload, so a version query keeps browsers from showing the old image.
    return `${publicUrl}?v=${Date.now()}`;
  };

  const save = async () => {
    setError(null);
    if (!me || !clinicId || !myPractitionerId) return;
    if (bio.length > BIO_MAX) {
      setError(`Your bio can be at most ${BIO_MAX} characters.`);
      return;
    }
    for (const f of [photo, signature]) {
      const problem = f ? imageFileProblem(f) : null;
      if (problem) { setError(problem); return; }
    }
    setSaving(true);
    try {
      let photoUrl: string | null = null;
      let signatureUrl: string | null = null;
      if (photo) {
        photoUrl = await upload(photo, "photo");
        if (!photoUrl) { setError("The photo could not be uploaded. Try again."); return; }
      }
      if (signature) {
        signatureUrl = await upload(signature, "signature");
        if (!signatureUrl) { setError("The signature could not be uploaded. Try again."); return; }
      }
      const { data, error: rpcError } = await supabase.rpc("update_my_practitioner_profile", {
        _bio: bio.trim(),
        ...(photoUrl ? { _photo_url: photoUrl } : {}),
        ...(signatureUrl ? { _signature_url: signatureUrl } : {}),
      });
      const res = data as { ok?: boolean; error?: string } | null;
      if (rpcError || !res?.ok) {
        setError(res?.error === "INVALID" ? "Some values are not valid. Check them and try again." : "Could not save your details. Please try again.");
        return;
      }
      setPhoto(null);
      setSignature(null);
      await refetch();
      toast.success("Your details were updated");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-border/60 shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><UserCircle className="h-5 w-5 text-royal" /> Your doctor details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Row label="Name" value={me?.display_name ?? staffName} />
          <Row label="Specialization" value={me?.specialization} />
          <Row label="Qualifications" value={me?.qualifications} />
          <Row label="Experience (years)" value={me?.experience_years} />
          <Row label="Medical registration number" value={me?.registration_number} />
        </div>
        <p className="text-xs text-muted-foreground">
          These appear on your prescriptions. To change them, ask the clinic owner to update your details on the Doctors page.
        </p>

        {me && completeness && (
          <div className="space-y-3 border-t pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">Your public profile</h3>
              <Badge variant="outline" className={completeness.hasIndexableBio ? "bg-success/15 text-success border-success/30" : "bg-warning/15 text-warning border-warning/30"}>
                {completenessChipLabel(completeness)}
              </Badge>
              {publicPath && (
                <a href={publicPath} target="_blank" rel="noopener noreferrer"
                  className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-royal hover:underline">
                  View my public page<span className="sr-only"> (opens in a new tab)</span>
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              )}
            </div>
            {notIndexableNote(completeness) && <p className="text-xs text-muted-foreground">{notIndexableNote(completeness)}</p>}
            {youCanAdd.length === 0 && ownerToAdd.length === 0 ? (
              <p className="flex items-center gap-1.5 text-sm text-foreground"><CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" /> Your profile is complete.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {youCanAdd.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-foreground">You can add</p>
                    <ul className="mt-1 space-y-1">
                      {youCanAdd.map((l) => (
                        <li key={l} className="flex items-start gap-1.5 text-sm text-muted-foreground"><Circle className="h-3.5 w-3.5 mt-1 shrink-0" aria-hidden="true" />{l}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {ownerToAdd.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-foreground">Ask the clinic owner to change these</p>
                    <ul className="mt-1 space-y-1">
                      {ownerToAdd.map((l) => (
                        <li key={l} className="flex items-start gap-1.5 text-sm text-muted-foreground"><Circle className="h-3.5 w-3.5 mt-1 shrink-0" aria-hidden="true" />{l}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Your name, specialization, qualifications, fee and hours are managed by the clinic owner. Ask them to change these.
            </p>
          </div>
        )}

        {me && (
          <div className="space-y-4 border-t pt-4">
            <div className="flex items-center gap-3">
              {me.photo_url ? (
                <img src={me.photo_url} alt="Your photo" className="h-14 w-14 rounded-full object-cover shrink-0" />
              ) : (
                <div className="h-14 w-14 rounded-full bg-secondary flex items-center justify-center shrink-0"><UserCircle className="h-7 w-7 text-muted-foreground" /></div>
              )}
              <div className="space-y-1.5 flex-1">
                <Label htmlFor="my-doc-photo">Photo</Label>
                <Input id="my-doc-photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={saving}
                  onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="my-doc-sign">Signature</Label>
              <Input id="my-doc-sign" type="file" accept="image/jpeg,image/png,image/webp" disabled={saving}
                onChange={(e) => setSignature(e.target.files?.[0] ?? null)} />
              {me.signature_url && <img src={me.signature_url} alt="Your signature" className="h-10 object-contain" />}
            </div>
            <div className="space-y-3">
              <BioAssistant
                idPrefix="my-doc"
                value={bio}
                onChange={setBio}
                disabled={saving}
                rows={4}
                helpText={`Shown on your public doctor page. ${bioNeeded > 0
                  ? `Write at least ${MIN_INDEXABLE_BIO_CHARS} characters so Google can list your page (${bioNeeded} more).`
                  : "Long enough for Google to list your page."}`}
                context={{
                  name: me.display_name, specialization: me.specialization, qualifications: me.qualifications,
                  experience: me.experience_years, clinicName: profile?.clinic_name,
                  city: profile?.city, locality: (profile as { locality?: string | null } | null)?.locality,
                }}
              />
              <div className="rounded-md border border-dashed bg-muted/30 p-3">
                <p className="text-[11px] font-medium text-muted-foreground">How your bio looks on your page</p>
                {bio.trim() ? (
                  <p className="mt-1 text-sm text-foreground whitespace-pre-line break-words" data-testid="bio-preview">{bio.trim()}</p>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground italic">Nothing written yet. Visitors will see "Profile coming soon".</p>
                )}
              </div>
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MyDoctorDetailsCard;
