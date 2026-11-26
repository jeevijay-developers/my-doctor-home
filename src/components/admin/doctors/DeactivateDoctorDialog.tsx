import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Practitioner } from "@/lib/practitioners/types";
import { practitionerErrorMessage } from "@/lib/practitioners/errors";
import { usePractitioners } from "@/hooks/usePractitioners";
import { formatIstDate } from "@/lib/istDate";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import PractitionerSelect from "../PractitionerSelect";

type StatusResult = { ok?: boolean; error?: string; count?: number } | null;
type ReassignResult = { ok?: boolean; error?: string; moved?: number; skipped?: string[]; skipped_reasons?: { id: string; reason?: string | null }[] | null } | null;
type SkippedRow = { id: string; date: string; time_slot: string | null; patient_name: string; reason?: string | null };

// A reason is a database code (SLOT_TAKEN, ...) or already plain text; anything else is left out.
const reasonText = (reason: string | null | undefined): string | null =>
  !reason ? null : practitionerErrorMessage(reason) ?? (/\s/.test(reason) ? reason : null);

const fallback = "Something went wrong. Please try again.";

interface Props {
  /** The doctor to deactivate; null = closed. */
  practitioner: Practitioner | null;
  clinicId: string;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}

// Deactivate a doctor. If they still have upcoming bookings, offer to move them to another
// bookable doctor first, report the ones that could not move (time clash), then retry.
const DeactivateDoctorDialog = ({ practitioner, clinicId, onClose, onDone }: Props) => {
  const { bookable, primary } = usePractitioners();
  const [step, setStep] = useState<"confirm" | "move" | "result">("confirm");
  const [futureCount, setFutureCount] = useState(0);
  const [target, setTarget] = useState<string | null>(null);
  const [moved, setMoved] = useState(0);
  const [skipped, setSkipped] = useState<SkippedRow[]>([]);
  const [stillBlocked, setStillBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const id = practitioner?.id ?? null;
  const targets = bookable.filter((p) => p.id !== id);

  useEffect(() => {
    if (!id) return;
    setStep("confirm");
    setFutureCount(0);
    setMoved(0);
    setSkipped([]);
    setStillBlocked(false);
    setError(null);
    const others = bookable.filter((p) => p.id !== id);
    setTarget((others.find((p) => p.id === primary?.id) ?? others[0])?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // afterMove: the bookings were just moved, so a refusal shows as "still blocked"
  // on the result step instead of going back to the move step.
  const tryDeactivate = async (afterMove: boolean): Promise<void> => {
    if (!id) return;
    const { data, error: rpcError } = await supabase.rpc("set_practitioner_status", {
      _id: id, _is_active: false, _is_bookable: false,
    });
    const res = data as StatusResult;
    if (rpcError) { setError(practitionerErrorMessage(rpcError.message) ?? fallback); return; }
    if (res?.ok) {
      toast.success(`${practitioner?.display_name} deactivated`);
      await onDone();
      onClose();
      return;
    }
    if (res?.error === "HAS_FUTURE_APPOINTMENTS") {
      setFutureCount(res.count ?? 0);
      if (afterMove) setStillBlocked(true);
      else setStep("move");
      return;
    }
    setError(practitionerErrorMessage(res?.error) ?? fallback);
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await fn(); } finally { setBusy(false); }
  };

  const moveBookings = async () => {
    if (!id || !target) return;
    const { data, error: rpcError } = await supabase.rpc("reassign_practitioner_appointments", { _from: id, _to: target });
    const res = data as ReassignResult;
    if (rpcError || !res?.ok) {
      setError(practitionerErrorMessage(rpcError?.message ?? res?.error) ?? fallback);
      return;
    }
    setMoved(res.moved ?? 0);
    const reasons = new Map((res.skipped_reasons ?? []).map((r) => [r.id, reasonText(r.reason)] as const));
    const skippedIds = res.skipped ?? (res.skipped_reasons ?? []).map((r) => r.id);
    if (skippedIds.length) {
      const { data: rows } = await supabase
        .from("appointments")
        .select("id, date, time_slot, patient_name")
        .eq("doctor_id", clinicId)
        .in("id", skippedIds);
      const found = (rows ?? []) as SkippedRow[];
      // Keep every skipped id visible even if its row could not be read.
      setSkipped(skippedIds.map((sid) => ({
        ...(found.find((r) => r.id === sid) ?? { id: sid, date: "", time_slot: null, patient_name: "Appointment" }),
        reason: reasons.get(sid) ?? null,
      })));
    } else {
      setSkipped([]);
    }
    setStep("result");
    setStillBlocked(false);
    await tryDeactivate(true);
  };

  const name = practitioner?.display_name ?? "";

  return (
    <AlertDialog open={!!practitioner} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Deactivate {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {step === "confirm" && "They will no longer appear for booking, and any login they have is switched off. Past visits and prescriptions are kept."}
            {step === "move" && `${name} has ${futureCount} upcoming appointment${futureCount === 1 ? "" : "s"}. Move them to another doctor first.`}
            {step === "result" && "Bookings moved."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {step === "move" && (
          targets.length ? (
            <div className="space-y-1.5">
              <Label>Move bookings to</Label>
              <PractitionerSelect value={target} onChange={setTarget} options="bookable" excludeIds={id ? [id] : []}
                aria-label="Move bookings to" disabled={busy} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No other doctor is taking bookings. Cancel these appointments first, then deactivate.</p>
          )
        )}

        {step === "result" && (
          <div className="space-y-2 text-sm">
            <p>
              Moved {moved}.
              {skipped.length > 0 && ` These ${skipped.length} could not be moved${skipped.some((r) => r.reason) ? ":" : " (time clash):"}`}
            </p>
            {skipped.length > 0 && (
              <ul className="list-disc pl-5 space-y-0.5 max-h-48 overflow-y-auto">
                {skipped.map((r) => (
                  <li key={r.id}>
                    {[r.date ? formatIstDate(r.date) : null, r.time_slot ? r.time_slot.slice(0, 5) : null, r.patient_name].filter(Boolean).join(" · ")}
                    {r.reason && <span className="text-muted-foreground"> - {r.reason}</span>}
                  </li>
                ))}
              </ul>
            )}
            {stillBlocked && (
              <p className="text-muted-foreground">
                {name} still has {futureCount} upcoming appointment{futureCount === 1 ? "" : "s"}. Reschedule or cancel them, then try again.
              </p>
            )}
            <p className="text-xs text-muted-foreground">Let the patients know about their new doctor.</p>
          </div>
        )}

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{step === "result" ? "Close" : "Cancel"}</AlertDialogCancel>
          {step === "confirm" && (
            <Button variant="destructive" onClick={() => run(() => tryDeactivate(false))} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Deactivate
            </Button>
          )}
          {step === "move" && targets.length > 0 && (
            <Button className="bg-royal hover:bg-royal/90" onClick={() => run(moveBookings)} disabled={busy || !target}>
              {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Move bookings
            </Button>
          )}
          {step === "result" && stillBlocked && (
            <Button variant="destructive" onClick={() => run(() => tryDeactivate(true))} disabled={busy}>Try again</Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeactivateDoctorDialog;
