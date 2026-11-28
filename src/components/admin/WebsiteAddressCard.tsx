import { Copy, ExternalLink, Globe } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/hooks/useProfile";
import { usePractitioners } from "@/hooks/usePractitioners";
import { clinicDisplayUrl, clinicSitePath } from "@/lib/clinicSlug";

// Read-only. The database switches a clinic to its clinic-name address by itself when the 2nd active
// doctor is added (20261128130000_auto_clinic_address.sql); old links keep redirecting.
const WebsiteAddressCard = () => {
  const { profile, can, role } = useProfile();
  const activeCount = usePractitioners().active?.length ?? 0;
  const current = ((profile as { slug?: string | null } | null)?.slug ?? "").trim();

  // Owner always; staff only with "Edit Profile". Doctor logins never see the clinic address card.
  const allowed = role === "owner" || (role === "staff" && can("profile.edit"));
  if (!profile || !allowed) return null;

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(`https://${clinicDisplayUrl(current)}`);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy the link. Please select and copy it manually.");
    }
  };

  return (
    <Card className="border-border/60 shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5 text-royal" aria-hidden="true" /> Website address</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm font-medium text-foreground break-all">{current ? clinicDisplayUrl(current) : "Not set"}</p>
        {current && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={copy}>
              <Copy className="h-4 w-4 mr-2" aria-hidden="true" /> Copy link
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={clinicSitePath(current)} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" aria-hidden="true" /> Open
              </a>
            </Button>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {activeCount >= 2
            ? "Your address uses your clinic name. Old links keep working."
            : "Your address changes automatically to your clinic name when you add a second doctor. Old links keep working."}
        </p>
      </CardContent>
    </Card>
  );
};

export default WebsiteAddressCard;
