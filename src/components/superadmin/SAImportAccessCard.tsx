import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { formatIstDate } from "@/lib/istDate";

type Access = {
  eligible: boolean;
  cap: number;
  patient_count: number;
  override: { mode: "allowed" | "blocked"; until: string | null; reason: string; set_at: string } | null;
  // Added by a newer server; older servers omit them, so every use must tolerate undefined.
  plan_tier?: string | null;
  plan_status?: string | null;
  plan_end?: string | null;
  reason?: "ok_plan" | "ok_override" | "blocked_override" | "plan_not_eligible" | string;
};

type Mode = "allowed" | "blocked";

const fmt = (v: number) => v.toLocaleString("en-IN");

// "Ends on" is a calendar day in IST (end of that day), like every other date in the
// superadmin panel; building it in the browser's own zone would shift it for a viewer
// outside India.
const endOfIstDay = (day: string) => new Date(`${day}T23:59:59+05:30`);

const cap1 = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);

const overrideText = (o: NonNullable<Access["override"]>) =>
  `${o.mode === "blocked" ? "Blocked by superadmin" : "Allowed by superadmin"}${
    o.until ? ` until ${formatIstDate(o.until)}` : ""
  }: ${o.reason}`;

const planNotEligibleText = (a: Access) => {
  const tier = (a.plan_tier ?? "").toLowerCase();
  if (tier !== "pro" && tier !== "premium") {
    return `Not on a paid plan (current plan: ${a.plan_tier || "unknown"}, status ${a.plan_status || "unknown"})`;
  }
  if (a.plan_status !== "active") return `Plan is ${a.plan_status || "not active"}`;
  if (a.plan_end && new Date(a.plan_end).getTime() < Date.now()) {
    return `Paid period ended on ${formatIstDate(a.plan_end)}`;
  }
  return "Not eligible";
};

type Props = { doctorId: string; canManage: boolean };

const SAImportAccessCard = ({ doctorId, canManage }: Props) => {
  const [access, setAccess] = useState<Access | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false); // synchronous guard: a double-click fires before state re-renders
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase.rpc("get_doctor_import_access" as any, { _doctor_id: doctorId });
    if (seq !== loadSeq.current) return; // a newer load (other doctor) superseded this one
    if (error || !data) {
      setAccess(null);
      setLoadError(error?.message || "No data returned");
    } else {
      setAccess(data as unknown as Access);
    }
    setLoading(false);
  }, [doctorId]);

  useEffect(() => {
    // Different clinic: drop the previous clinic's data and any half-filled form.
    setAccess(null);
    setMode(null);
    setReason("");
    setUntil("");
    void load();
    return () => {
      loadSeq.current++;
    };
  }, [load]);

  const resetForm = () => {
    setMode(null);
    setReason("");
    setUntil("");
  };

  const save = async (m: Mode | "clear") => {
    if (savingRef.current) return;
    let untilIso: string | null = null;
    if (m !== "clear") {
      if (!reason.trim()) {
        toast({ title: "Add a reason", description: "It is recorded in the audit log.", variant: "destructive" });
        return;
      }
      if (until) {
        const end = endOfIstDay(until);
        if (Number.isNaN(end.getTime()) || end.getTime() <= Date.now()) {
          toast({ title: "End date must be in the future", variant: "destructive" });
          return;
        }
        untilIso = end.toISOString();
      }
    }
    savingRef.current = true;
    setSaving(true);
    const { error } = await supabase.rpc("set_patient_import_override" as any, {
      _doctor_id: doctorId,
      _mode: m,
      _until: untilIso,
      _reason: m === "clear" ? null : reason.trim(),
    });
    savingRef.current = false;
    setSaving(false);
    if (error) {
      toast({ title: "Could not save", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: m === "clear" ? "Override cleared" : "Override saved" });
    resetForm();
    void load();
  };

  if (loading && !access) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading patient import access...
        </CardContent>
      </Card>
    );
  }

  if (!access) {
    return (
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-destructive" role="alert">
            Could not load patient import access{loadError ? `: ${loadError}` : "."}
          </p>
          <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  const o = access.override;
  const expired = !!o?.until && new Date(o.until).getTime() <= Date.now();
  const activeOverride = o && !expired ? o : null;

  let why: string;
  switch (access.reason) {
    case "ok_plan":
      why = `Included in the ${access.plan_tier ? cap1(access.plan_tier) : "Pro/Premium"} plan`;
      break;
    case "ok_override":
    case "blocked_override":
      // The server decided an override applies; show it even if the browser clock disagrees on expiry.
      why = o ? overrideText(o) : access.reason === "ok_override" ? "Allowed by superadmin" : "Blocked by superadmin";
      break;
    case "plan_not_eligible":
      why = planNotEligibleText(access);
      break;
    default:
      // Older server without `reason`: keep the previous behaviour.
      if (activeOverride) why = overrideText(activeOverride);
      else if (access.eligible) why = "Included in the Pro/Premium plan";
      else why = "Not on a paid plan";
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-heading font-semibold text-foreground">Patient import</h3>
          <span className={`text-xs font-medium ${access.eligible ? "text-success" : "text-destructive"}`}>
            {access.eligible ? "Import is on" : "Import is off"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {fmt(access.patient_count)} of {fmt(access.cap)} patients (import limit)
        </p>
        <p className="text-xs text-muted-foreground break-words">{why}</p>
        {o && expired && (
          <p className="text-xs text-muted-foreground break-words">
            An earlier {o.mode === "blocked" ? "block" : "allow"} override ended on {formatIstDate(o.until!)} and no longer applies.
          </p>
        )}

        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={mode === "blocked" ? "default" : "outline"}
              aria-pressed={mode === "blocked"}
              disabled={saving}
              onClick={() => setMode("blocked")}
            >
              Block import
            </Button>
            <Button
              size="sm"
              variant={mode === "allowed" ? "default" : "outline"}
              aria-pressed={mode === "allowed"}
              disabled={saving}
              onClick={() => setMode("allowed")}
            >
              Allow import
            </Button>
            {o && mode === null && (
              <Button size="sm" variant="ghost" disabled={saving} onClick={() => save("clear")}>
                Clear override
              </Button>
            )}
          </div>
        )}

        {canManage && mode !== null && (
          <div className="space-y-2">
            <div className="space-y-1.5">
              <Label htmlFor="sa-override-reason">Reason</Label>
              <Input
                id="sa-override-reason"
                value={reason}
                maxLength={500}
                placeholder="Recorded in the audit log"
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sa-override-until">Ends on (optional, IST)</Label>
              <Input id="sa-override-until" type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={saving} onClick={() => save(mode)}>
                {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                Save
              </Button>
              <Button size="sm" variant="ghost" disabled={saving} onClick={resetForm}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SAImportAccessCard;
