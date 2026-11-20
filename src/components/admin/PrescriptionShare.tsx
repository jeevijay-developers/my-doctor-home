import { useCallback, useEffect, useState } from "react";
import { MessageCircle, Link2, Ban } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  buildShareMessage, buildWhatsAppUrl, prescriptionShareUrl, whatsappNumber,
} from "@/lib/prescriptionShare";

type ShareRow = {
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  view_count: number;
  first_viewed_at: string | null;
};

type Props = {
  prescriptionId: string;
  patientName: string;
  /** The phone saved on the patient record (filled in when the appointment was booked). */
  patientPhone: string | null;
  doctorName: string;
};

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

const statusText = (s: ShareRow | null): string | null => {
  if (!s) return null;
  if (s.revoked_at) return "Link revoked";
  if (new Date(s.expires_at) < new Date()) return `Link expired ${fmt(s.expires_at)}`;
  const seen = s.view_count > 0 ? `Viewed by patient${s.first_viewed_at ? ` on ${fmt(s.first_viewed_at)}` : ""}` : "Not opened yet";
  return `Shared ${fmt(s.created_at)} · ${seen}`;
};

// Share is always a deliberate click: it makes a private link and opens WhatsApp to the
// patient's saved number with the message ready to send. Nothing is sent automatically.
const PrescriptionShare = ({ prescriptionId, patientName, patientPhone, doctorName }: Props) => {
  const [latest, setLatest] = useState<ShareRow | null>(null);
  const [busy, setBusy] = useState(false);

  const loadStatus = useCallback(async () => {
    const { data } = await supabase
      .from("prescription_shares" as any)
      .select("created_at, expires_at, revoked_at, view_count, first_viewed_at")
      .eq("prescription_id", prescriptionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setLatest((data as unknown as ShareRow) ?? null);
  }, [prescriptionId]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const createLink = async (): Promise<string | null> => {
    const { data, error } = await supabase.rpc("create_prescription_share" as any, { _prescription_id: prescriptionId });
    const token = (data as { token?: string } | null)?.token;
    if (error || !token) {
      toast.error("Could not create the share link");
      return null;
    }
    return prescriptionShareUrl(window.location.origin, token);
  };

  const shareOnWhatsApp = async () => {
    if (busy) return;
    setBusy(true);
    // Open the tab inside the click so the browser doesn't treat it as a popup, then point it
    // at WhatsApp once the link exists.
    const tab = window.open("", "_blank");
    try {
      const link = await createLink();
      if (!link) { tab?.close(); return; }
      const url = buildWhatsAppUrl(patientPhone, buildShareMessage({ patientName, doctorName, link }));
      if (tab) tab.location.href = url;
      else window.location.href = url;
      await loadStatus();
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const link = await createLink();
      if (!link) return;
      await navigator.clipboard.writeText(link);
      toast.success("Link copied. The patient needs the last 4 digits of their phone to open it.");
      await loadStatus();
    } catch {
      toast.error("Could not copy the link");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    const { error } = await supabase.rpc("revoke_prescription_share" as any, { _prescription_id: prescriptionId });
    if (error) { toast.error("Could not revoke the link"); return; }
    toast.success("Link revoked");
    await loadStatus();
  };

  const active = latest && !latest.revoked_at && new Date(latest.expires_at) >= new Date();
  const hasNumber = whatsappNumber(patientPhone) !== null;
  const text = statusText(latest);

  return (
    <div className="flex flex-col items-start gap-1 mr-auto" data-prescription-share>
      <div className="flex flex-wrap gap-2">
        <Button onClick={shareOnWhatsApp} disabled={busy} className="gap-1.5 bg-[#25D366] hover:bg-[#1ebe5b] text-white">
          <MessageCircle className="h-4 w-4" /> Share on WhatsApp
        </Button>
        <Button variant="outline" onClick={copyLink} disabled={busy} className="gap-1.5">
          <Link2 className="h-4 w-4" /> Copy link
        </Button>
        {active && (
          <Button variant="ghost" onClick={revoke} className="gap-1.5 text-destructive hover:text-destructive">
            <Ban className="h-4 w-4" /> Revoke
          </Button>
        )}
      </div>
      {!hasNumber && (
        <p className="text-[11px] text-warning">No valid phone saved for this patient. WhatsApp will ask you to choose the contact.</p>
      )}
      {text && <p className="text-[11px] text-muted-foreground">{text}</p>}
    </div>
  );
};

export default PrescriptionShare;
