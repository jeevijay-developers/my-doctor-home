import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import type { ClinicDoctorAccess } from "@/lib/practitioners/types";

type Doctor = { id: string; display_name: string; is_primary: boolean; is_active: boolean; is_bookable: boolean };

type Props = { doctorId: string; canManage: boolean };

const FORBIDDEN_TEXT = "You are not allowed to change doctor seats.";

const saveErrorText = (code: string | undefined, maxExtra: number) => {
  switch (code) {
    case "FORBIDDEN":
      return FORBIDDEN_TEXT;
    case "INVALID":
      return `Extra seats must be a whole number between 0 and ${maxExtra}.`;
    case "REASON_REQUIRED":
      return "Add a reason. It is recorded in the audit log.";
    default:
      return code || "Unknown error";
  }
};

// Superadmin view of a clinic's multi-doctor access: whether it is on (and why not), seats used
// against the limit, and the extra seats a superadmin granted. Seats live in clinic_doctor_seats,
// written only through set_clinic_doctor_seats (audited, reason required).
const SADoctorSeatsCard = ({ doctorId, canManage }: Props) => {
  const [access, setAccess] = useState<ClinicDoctorAccess | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [extra, setExtra] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false); // synchronous guard: a double-click fires before state re-renders
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setLoadError(null);
    const [acc, docs] = await Promise.all([
      supabase.rpc("get_clinic_doctor_access" as any, { _doctor_id: doctorId }),
      supabase
        .from("practitioners")
        .select("id, display_name, is_primary, is_active, is_bookable")
        .eq("doctor_id", doctorId)
        .order("is_primary", { ascending: false })
        .order("sort_order")
        .order("created_at"),
    ]);
    if (seq !== loadSeq.current) return; // a newer load (other doctor) superseded this one
    const data = acc.data as unknown as (ClinicDoctorAccess & { error?: string }) | null;
    if (acc.error || !data || data.error) {
      setAccess(null);
      setLoadError(data?.error === "FORBIDDEN" ? FORBIDDEN_TEXT.replace("change", "view") : acc.error?.message || "No data returned");
    } else {
      setAccess(data);
      setExtra(String(data.extra_seats ?? 0));
    }
    setDoctors(docs.error ? [] : ((docs.data as unknown as Doctor[]) ?? []));
    setLoading(false);
  }, [doctorId]);

  useEffect(() => {
    // Different clinic: drop the previous clinic's data and any half-filled form.
    setAccess(null);
    setDoctors([]);
    setExtra("");
    setReason("");
    void load();
    return () => {
      loadSeq.current++;
    };
  }, [load]);

  const maxExtra = Math.max(0, (access?.seat_max ?? 15) - 1);

  const save = async () => {
    if (savingRef.current) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      toast({ title: "Could not save", description: saveErrorText("REASON_REQUIRED", maxExtra), variant: "destructive" });
      return;
    }
    const n = Number(extra);
    if (extra.trim() === "" || !Number.isInteger(n) || n < 0 || n > maxExtra) {
      toast({ title: "Could not save", description: saveErrorText("INVALID", maxExtra), variant: "destructive" });
      return;
    }
    savingRef.current = true;
    setSaving(true);
    const { data, error } = await supabase.rpc("set_clinic_doctor_seats" as any, {
      _doctor_id: doctorId,
      _extra: n,
      _reason: trimmed,
    });
    savingRef.current = false;
    setSaving(false);
    const res = data as { ok?: boolean; error?: string; seat_limit?: number } | null;
    if (error || !res?.ok) {
      toast({
        title: "Could not save",
        description: error ? error.message : saveErrorText(res?.error, maxExtra),
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Seats saved", description: res.seat_limit != null ? `Seat limit is now ${res.seat_limit}.` : undefined });
    setReason("");
    void load();
  };

  if (loading && !access) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading doctor seats...
        </CardContent>
      </Card>
    );
  }

  if (!access) {
    return (
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-destructive" role="alert">
            Could not load doctor seats{loadError ? `: ${loadError}` : "."}
          </p>
          <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  const why = access.enabled
    ? null
    : !access.has_feature
      ? "The clinic's plan does not include Multiple doctors (Premium or trial, or a feature override)."
      : "Multiple doctors is not launched yet and this clinic is not in the pilot.";

  const extraCount = access.extra_seats ?? 0;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-heading font-semibold text-foreground">Doctor seats</h3>
          <span className={`text-xs font-medium ${access.enabled ? "text-success" : "text-muted-foreground"}`}>
            {access.enabled ? "Multiple doctors is on" : "Multiple doctors is off"}
          </span>
        </div>
        {why && <p className="text-xs text-muted-foreground break-words">{why}</p>}
        <p className="text-xs text-muted-foreground">
          {access.seats_used} of {access.seat_limit} seats in use · {extraCount} extra {extraCount === 1 ? "seat" : "seats"} granted
          {" "}(max {access.seat_max})
        </p>
        {doctors.length > 0 && (
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {doctors.map((d) => (
              <li key={d.id} className="break-words">
                {d.display_name}
                {d.is_primary ? " (main)" : ""}
                {!d.is_active ? " (inactive)" : !d.is_bookable ? " (not taking bookings)" : ""}
              </li>
            ))}
          </ul>
        )}

        {canManage && (
          <div className="space-y-2">
            {access.has_feature && !access.enabled && (
              <p className="text-xs text-muted-foreground">Pilot: enable 'Multiple doctors' in Feature access above.</p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="sa-seats-extra">Extra seats</Label>
              <Input
                id="sa-seats-extra"
                type="number"
                min={0}
                max={maxExtra}
                step={1}
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sa-seats-reason">Reason</Label>
              <Input
                id="sa-seats-reason"
                value={reason}
                maxLength={500}
                placeholder="Recorded in the audit log"
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <Button size="sm" disabled={saving || !reason.trim()} onClick={() => void save()}>
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
              Save
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SADoctorSeatsCard;
