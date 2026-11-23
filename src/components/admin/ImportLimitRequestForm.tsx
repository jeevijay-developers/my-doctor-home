import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatIstDate } from "@/lib/istDate";
import type { ImportAccess } from "@/lib/patientImportApi";

const NOTE_MAX = 1000;
// Far above any real limit, and small enough that the number is always exact. The server
// still applies its own ceiling.
const DIGITS_MAX = 9;

const fmt = (v: number) => v.toLocaleString("en-IN");
const asNumber = (v: unknown) => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};
// A date that has not passed yet, or null (missing, unreadable or already past).
const futureDate = (iso: unknown): string | null => {
  if (typeof iso !== "string") return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t > Date.now() ? formatIstDate(iso) : null;
};

const WAITING = "Your request is waiting for review. We will notify you when it is decided.";

const REFUSALS: Record<string, string> = {
  NOT_ELIGIBLE: "Importing patients is available on the Pro and Premium plans.",
  BAD_NOTE: "Please keep the reason under 1,000 characters.",
};

type Props = { access: ImportAccess; needed: number; onRequested: () => void };

// Shown when a file is bigger than the clinic's remaining import room. The decision is a
// person's: nothing here raises a limit by itself.
const ImportLimitRequestForm = ({ access, needed, onRequested }: Props) => {
  const cap = asNumber(access.cap);
  const fileNeeds = asNumber(access.patient_count) + Math.max(0, asNumber(needed));
  const start = Math.max(fileNeeds, cap + 1);
  const [requested, setRequested] = useState(String(start));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set synchronously, so a second click before the next render cannot send a second request.
  const sending = useRef(false);

  if (!access.eligible) return null;
  if (access.pending_request || sent) return <p className="text-sm text-muted-foreground">{WAITING}</p>;
  const until = futureDate(access.cooldown_until);
  if (until) return <p className="text-sm text-muted-foreground">Your last request was not approved. You can ask again on {until}.</p>;

  const send = async () => {
    if (sending.current) return;
    setError(null);
    const n = requested === "" ? NaN : Number(requested);
    if (!Number.isSafeInteger(n) || n <= cap) {
      setError(`Enter a number above your current limit of ${fmt(cap)}.`);
      return;
    }
    sending.current = true;
    setBusy(true);
    try {
      const { data, error: rpcError } = await supabase.rpc("request_patient_import_limit" as any, {
        _requested: n,
        _note: note.trim().slice(0, NOTE_MAX) || null,
      });
      const r = data as { ok?: boolean; error?: string; until?: string; cap?: number; ceiling?: number } | null;
      if (rpcError || !r || typeof r !== "object") { setError("Could not send the request. Please try again."); return; }
      if (!r.ok) {
        if (r.error === "ALREADY_PENDING") { setSent(true); onRequested(); return; }
        if (r.error === "COOLDOWN") {
          const when = futureDate(r.until);
          setError(`Your last request was not approved.${when ? ` You can ask again on ${when}.` : " You can ask again later."}`);
        } else if (r.error === "BAD_NUMBER") {
          setError(`Enter a number above ${fmt(r.cap ?? cap)} and up to ${fmt(r.ceiling ?? 100000)}.`);
        } else {
          setError(REFUSALS[r.error ?? ""] ?? "Could not send the request. Please try again.");
        }
        return;
      }
      setSent(true);
      toast.success("Request sent. We will notify you when it is decided.");
      onRequested();
    } catch {
      setError("Could not send the request. Please try again.");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <p className="text-sm font-medium text-foreground">Request a higher limit</p>
      <div className="space-y-1.5">
        <Label htmlFor="import-limit-number">Patients you need to hold</Label>
        <Input
          id="import-limit-number"
          inputMode="numeric"
          maxLength={DIGITS_MAX}
          value={requested}
          onChange={(e) => setRequested(e.target.value.replace(/\D/g, "").slice(0, DIGITS_MAX))}
          className="h-9"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="import-limit-note">Why do you need this?</Label>
        <Textarea id="import-limit-note" rows={2} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))} />
      </div>
      {requested !== "" && Number(requested) > cap && Number(requested) < fileNeeds && (
        <p className="text-xs text-muted-foreground">
          Your file needs at least {fmt(fileNeeds)}, requesting less means you may have to ask again.
        </p>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="button" size="sm" disabled={busy} onClick={send} className="bg-royal hover:bg-royal/90">
        {busy ? "Sending…" : "Send request"}
      </Button>
    </div>
  );
};

export default ImportLimitRequestForm;
