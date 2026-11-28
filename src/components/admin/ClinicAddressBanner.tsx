import { useEffect, useState } from "react";
import { Globe, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/hooks/useProfile";
import { usePractitioners } from "@/hooks/usePractitioners";
import {
  clinicDisplayUrl, dismissAddressBanner, isAddressBannerDismissed, shouldOfferAddressBanner,
} from "@/lib/clinicSlug";
import { SlugChangeDialog, saveClinicSlug } from "./WebsiteAddressCard";

// Opt-in nudge for a clinic that just became multi-doctor: its address still carries the owner's
// personal name. Owner only; "Not now" is remembered per clinic in this browser. Never automatic.
const ClinicAddressBanner = () => {
  const { profile, role, refetch } = useProfile();
  const activeCount = usePractitioners().active?.length ?? 0;
  const clinicId = profile?.id ?? null;
  const slug = (profile as { slug?: string | null } | null)?.slug ?? null;
  const locked = (profile as { slug_locked?: boolean | null } | null)?.slug_locked ?? false;
  const isOwner = role === "owner";
  const [suggested, setSuggested] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(() => (clinicId ? isAddressBannerDismissed(clinicId) : false));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const eligible = isOwner && !!clinicId && activeCount >= 2 && !locked && !dismissed;

  useEffect(() => { if (clinicId) setDismissed(isAddressBannerDismissed(clinicId)); }, [clinicId]);

  useEffect(() => {
    if (!eligible || !profile) return;
    let cancelled = false;
    const name = (profile as any).clinic_name || (profile as any).full_name || "";
    (supabase.rpc as any)("suggest_clinic_slug", { _clinic_name: name, _city: (profile as any).city ?? null })
      .then(({ data, error }: any) => { if (!cancelled && !error && typeof data === "string") setSuggested(data); });
    return () => { cancelled = true; };
  }, [eligible, profile?.id, (profile as any)?.clinic_name, (profile as any)?.city]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!clinicId || !shouldOfferAddressBanner({
    activePractitioners: activeCount, currentSlug: slug, suggestedSlug: suggested, dismissed, isOwner, slugLocked: locked,
  }) || !suggested) return null;

  const notNow = () => { dismissAddressBanner(clinicId); setDismissed(true); };
  const apply = async () => {
    setSaving(true);
    const saved = await saveClinicSlug(suggested);
    setSaving(false);
    setConfirmOpen(false);
    if (!saved) return;
    toast.success(`Website address updated: ${clinicDisplayUrl(saved)}`);
    await refetch();
  };

  return (
    <div role="region" aria-label="Website address" className="relative rounded-xl border border-royal/20 bg-royal/5 p-4 pr-10">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Globe className="h-5 w-5 text-royal shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Use your clinic name in your website address</p>
          <p className="text-xs text-muted-foreground">
            Your team now has more than one doctor. Switch from {clinicDisplayUrl(slug!)} to {clinicDisplayUrl(suggested)}.
            Old links and QR codes keep working.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={notNow}>Not now</Button>
          <Button size="sm" onClick={() => setConfirmOpen(true)}>Use {suggested}</Button>
        </div>
      </div>
      <button type="button" onClick={notNow} aria-label="Dismiss" className="absolute right-3 top-3 text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
      <SlugChangeDialog open={confirmOpen} slug={suggested} busy={saving} onConfirm={apply} onCancel={() => setConfirmOpen(false)} />
    </div>
  );
};

export default ClinicAddressBanner;
