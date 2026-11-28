import { useEffect, useState } from "react";
import { Globe, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useProfile } from "@/hooks/useProfile";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  CLINIC_SLUG_MAX, clinicDisplayUrl, normalizeSlugInput, slugErrorMessage, validateSlugFormat,
} from "@/lib/clinicSlug";

type Check =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "ok" }
  | { state: "error"; code: string };

const rpc = (fn: string, args: Record<string, unknown>) => (supabase.rpc as any)(fn, args);

/** Explains what changing the address does; shared by the Settings card and the dashboard banner. */
export const SlugChangeDialog = ({
  open, slug, busy, onConfirm, onCancel,
}: { open: boolean; slug: string; busy: boolean; onConfirm: () => void; onCancel: () => void }) => (
  <AlertDialog open={open} onOpenChange={(o) => { if (!o && !busy) onCancel(); }}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Change your website address?</AlertDialogTitle>
        <AlertDialogDescription>
          Your new address will be {clinicDisplayUrl(slug)}. Your old links, bookmarks and printed QR codes keep
          working: patients who open them are sent to the new address automatically.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
        <AlertDialogAction
          disabled={busy}
          onClick={(e) => { e.preventDefault(); onConfirm(); }}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null} Change address
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

/** Saves the address; returns the saved slug, or shows the coded error and returns null. */
export async function saveClinicSlug(slug: string): Promise<string | null> {
  const { data, error } = await rpc("set_clinic_slug", { _slug: slug });
  if (error || !data || (data as { ok?: boolean }).ok !== true) {
    toast.error(slugErrorMessage((data as { error?: string } | null)?.error));
    return null;
  }
  return (data as { slug: string }).slug;
}

const WebsiteAddressCard = () => {
  const { profile, can, role, refetch } = useProfile();
  const current = (profile as { slug?: string | null } | null)?.slug ?? "";
  const [value, setValue] = useState(current);
  const [check, setCheck] = useState<Check>({ state: "idle" });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const debounced = useDebouncedValue(value, 400);

  useEffect(() => { setValue(current); }, [current]);

  const normalized = normalizeSlugInput(value);
  const unchanged = normalized === current;

  // Live availability: format first (instant), then the database for the rest.
  useEffect(() => {
    const slug = normalizeSlugInput(debounced);
    if (!slug || slug === current) { setCheck({ state: "idle" }); return; }
    const bad = validateSlugFormat(slug);
    if (bad) { setCheck({ state: "error", code: bad }); return; }
    let cancelled = false;
    setCheck({ state: "checking" });
    rpc("is_clinic_slug_available", { _slug: slug }).then(({ data, error }: any) => {
      if (cancelled) return;
      if (error || !data) { setCheck({ state: "error", code: "UNKNOWN" }); return; }
      setCheck(data.available ? { state: "ok" } : { state: "error", code: data.code || "UNKNOWN" });
    });
    return () => { cancelled = true; };
  }, [debounced, current]);

  // Owner always; staff only with "Edit Profile". Doctor logins never edit the clinic address.
  const allowed = role === "owner" || (role === "staff" && can("profile.edit"));
  if (!profile || !allowed) return null;

  const suggest = async () => {
    setSuggesting(true);
    const name = (profile as any).clinic_name || (profile as any).full_name || "";
    const { data, error } = await rpc("suggest_clinic_slug", { _clinic_name: name, _city: (profile as any).city ?? null });
    setSuggesting(false);
    if (error || typeof data !== "string" || !data) { toast.error("Could not suggest an address. Please try again."); return; }
    setValue(data);
  };

  const confirm = async () => {
    setSaving(true);
    const saved = await saveClinicSlug(normalized);
    setSaving(false);
    setConfirmOpen(false);
    if (!saved) return;
    toast.success(`Website address updated: ${clinicDisplayUrl(saved)}`);
    await refetch();
  };

  const canSave = !unchanged && !!normalized && check.state === "ok" && !saving;
  const message =
    check.state === "error" ? slugErrorMessage(check.code)
    : check.state === "ok" ? "This address is available."
    : check.state === "checking" ? "Checking availability..."
    : null;

  return (
    <Card className="border-border/60 shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5 text-royal" aria-hidden="true" /> Website address</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-xs text-muted-foreground">Current address</p>
          <p className="text-sm font-medium text-foreground break-all">{current ? clinicDisplayUrl(current) : "Not set"}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="clinic-slug">New address</Label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">doctylia.com/dr/</span>
            <Input
              id="clinic-slug"
              value={value}
              maxLength={CLINIC_SLUG_MAX + 20}
              autoComplete="off"
              spellCheck={false}
              aria-describedby="clinic-slug-status"
              aria-invalid={check.state === "error"}
              onChange={(e) => setValue(e.target.value.toLowerCase())}
            />
          </div>
          <p
            id="clinic-slug-status"
            role="status"
            aria-live="polite"
            className={`text-xs min-h-4 ${check.state === "error" ? "text-destructive" : check.state === "ok" ? "text-success" : "text-muted-foreground"}`}
          >
            {message ?? "3-50 letters, numbers or dashes."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={suggest} disabled={suggesting}>
            {suggesting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4 mr-2" aria-hidden="true" />}
            Use clinic name
          </Button>
          <Button type="button" onClick={() => setConfirmOpen(true)} disabled={!canSave}>Save address</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Your old links and printed QR codes keep working after a change.
        </p>
      </CardContent>
      <SlugChangeDialog open={confirmOpen} slug={normalized} busy={saving} onConfirm={confirm} onCancel={() => setConfirmOpen(false)} />
    </Card>
  );
};

export default WebsiteAddressCard;
