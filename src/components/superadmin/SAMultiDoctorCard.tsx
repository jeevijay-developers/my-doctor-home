import { useCallback, useEffect, useRef, useState } from "react";
import { Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useSuperAdminAccess } from "@/contexts/SuperAdminAccessContext";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Saved = {
  multi_doctor_enabled: boolean;
  doctor_seat_price: number | null;
  doctor_seat_max: number;
  trial_extra_doctor_seats: number;
};
type Inputs = { price: string; max: string; trial: string };
type Errors = Partial<Record<keyof Inputs, string>>;

const DEFAULTS: Saved = {
  multi_doctor_enabled: false,
  doctor_seat_price: null,
  doctor_seat_max: 10,
  trial_extra_doctor_seats: 1,
};

const toInputs = (s: Saved): Inputs => ({
  price: s.doctor_seat_price == null ? "" : String(s.doctor_seat_price),
  max: String(s.doctor_seat_max),
  trial: String(s.trial_extra_doctor_seats),
});

const KEY_LABELS: Record<string, string> = {
  multi_doctor_enabled: "the launch switch",
  doctor_seat_price: "Price per extra doctor",
  doctor_seat_max: "Maximum doctors per clinic",
  trial_extra_doctor_seats: "Extra doctors during trial",
};

const numOr = (v: unknown, fallback: number) => (v != null && Number.isFinite(Number(v)) ? Number(v) : fallback);

/** Validates the three number fields. Returns errors, or the parsed values. */
function validate(i: Inputs): { errors: Errors } | { values: Pick<Saved, "doctor_seat_price" | "doctor_seat_max" | "trial_extra_doctor_seats"> } {
  const errors: Errors = {};
  let price: number | null = null;
  const p = i.price.trim();
  if (p !== "") {
    const n = Number(p);
    if (!Number.isFinite(n) || n <= 0 || n > 100000) errors.price = "Price must be a positive amount (up to 1,00,000), or leave it empty.";
    else price = Math.round(n * 100) / 100;
  }
  const max = Number(i.max.trim());
  if (i.max.trim() === "" || !Number.isInteger(max) || max < 2 || max > 50) errors.max = "Enter a whole number between 2 and 50.";
  const trial = Number(i.trial.trim());
  if (i.trial.trim() === "" || !Number.isInteger(trial) || trial < 0 || trial > 5) errors.trial = "Enter a whole number between 0 and 5.";
  if (errors.price || errors.max || errors.trial) return { errors };
  return { values: { doctor_seat_price: price, doctor_seat_max: max, trial_extra_doctor_seats: trial } };
}

const SAMultiDoctorCard = () => {
  const { can } = useSuperAdminAccess();
  const canManage = can("flags.manage");

  const [saved, setSaved] = useState<Saved>(DEFAULTS);
  const [inputs, setInputs] = useState<Inputs>(toInputs(DEFAULTS));
  const [errors, setErrors] = useState<Errors>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  const [overrideCount, setOverrideCount] = useState<number | null>(null);
  const [multiCount, setMultiCount] = useState<number | null>(null);

  const [launchTarget, setLaunchTarget] = useState<boolean | null>(null);
  const [typed, setTyped] = useState("");

  const loadSettings = useCallback(async () => {
    const { data, error } = await supabase.from("platform_settings").select("*");
    if (error) {
      toast({ title: "Could not load settings", description: error.message, variant: "destructive" });
      return;
    }
    const map = Object.fromEntries(((data ?? []) as { key: string; value: unknown }[]).map((r) => [r.key, r.value]));
    const next: Saved = {
      multi_doctor_enabled: map.multi_doctor_enabled === true,
      doctor_seat_price: map.doctor_seat_price != null && Number(map.doctor_seat_price) > 0 ? Number(map.doctor_seat_price) : null,
      doctor_seat_max: numOr(map.doctor_seat_max, DEFAULTS.doctor_seat_max),
      trial_extra_doctor_seats: numOr(map.trial_extra_doctor_seats, DEFAULTS.trial_extra_doctor_seats),
    };
    setSaved(next);
    setInputs(toInputs(next));
    setLoaded(true);
  }, []);

  useEffect(() => {
    let live = true;
    loadSettings();
    // Counters are informational: any failure shows a dash.
    (async () => {
      try {
        const { data, error } = await supabase
          .from("doctor_feature_overrides")
          .select("doctor_id, expires_at")
          .eq("feature_key", "multi_doctor")
          .eq("enabled", true);
        if (!live) return;
        if (error || !data) return setOverrideCount(null);
        const now = Date.now();
        const ids = new Set(
          (data as { doctor_id: string; expires_at: string | null }[])
            .filter((r) => !r.expires_at || new Date(r.expires_at).getTime() > now)
            .map((r) => r.doctor_id),
        );
        setOverrideCount(ids.size);
      } catch {
        if (live) setOverrideCount(null);
      }
    })();
    (async () => {
      try {
        const { data, error } = await supabase.from("practitioners").select("doctor_id").eq("is_active", true);
        if (!live) return;
        if (error || !data) return setMultiCount(null);
        const per = new Map<string, number>();
        (data as { doctor_id: string }[]).forEach((r) => per.set(r.doctor_id, (per.get(r.doctor_id) ?? 0) + 1));
        setMultiCount([...per.values()].filter((n) => n >= 2).length);
      } catch {
        if (live) setMultiCount(null);
      }
    })();
    return () => {
      live = false;
    };
  }, [loadSettings]);

  /** One atomic RPC with only the changed keys. The database audits every change itself. */
  const writeChanges = async (changes: Partial<Saved>): Promise<boolean> => {
    const keys = Object.keys(changes) as (keyof Saved)[];
    if (keys.length === 0) return true;
    if (busy.current) return false;
    busy.current = true;
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("set_multi_doctor_settings", { _changes: changes as never });
      const res = data as unknown as { ok: boolean; error?: string; key?: string } | null;
      if (error || !res) {
        toast({ title: "Failed to save", description: error?.message ?? "Please try again.", variant: "destructive" });
        return false;
      }
      if (!res.ok) {
        const description = res.error === "FORBIDDEN"
          ? "You do not have permission to change these settings."
          : res.error === "INVALID_VALUE"
            ? `Invalid value for ${KEY_LABELS[res.key ?? ""] ?? res.key ?? "a setting"}.`
            : "Please try again.";
        toast({ title: "Failed to save", description, variant: "destructive" });
        return false;
      }
      const next = { ...saved, ...changes } as Saved;
      setSaved(next);
      setInputs(toInputs(next));
      return true;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const changedValues = () => {
    const v = validate(inputs);
    if ("errors" in v) {
      setErrors(v.errors);
      return null;
    }
    setErrors({});
    const changes: Partial<Saved> = {};
    (["doctor_seat_price", "doctor_seat_max", "trial_extra_doctor_seats"] as const).forEach((k) => {
      if (v.values[k] !== saved[k]) (changes as Record<string, unknown>)[k] = v.values[k];
    });
    return changes;
  };

  const onSave = async () => {
    const changes = changedValues();
    if (!changes) return;
    if (Object.keys(changes).length === 0) {
      toast({ title: "Nothing to save" });
      return;
    }
    if (await writeChanges(changes)) toast({ title: "Settings saved" });
  };

  const dirty =
    inputs.price.trim() !== (saved.doctor_seat_price == null ? "" : String(saved.doctor_seat_price)) ||
    inputs.max.trim() !== String(saved.doctor_seat_max) ||
    inputs.trial.trim() !== String(saved.trial_extra_doctor_seats);

  const closeLaunch = () => {
    if (saving) return;
    setLaunchTarget(null);
    setTyped("");
  };

  const confirmLaunch = async () => {
    if (launchTarget === null) return;
    if (launchTarget && typed !== "LAUNCH") return;
    const target = launchTarget;
    const ok = await writeChanges({ multi_doctor_enabled: target });
    if (ok) {
      toast({ title: target ? "Multiple doctors launched" : "Multiple doctors switched off" });
      setLaunchTarget(null);
      setTyped("");
    }
  };

  const fmt = (n: number | null) => (n == null ? "—" : String(n));
  const field = (id: keyof Inputs) => (e: React.ChangeEvent<HTMLInputElement>) => setInputs((s) => ({ ...s, [id]: e.target.value }));

  return (
    <Card className="border-royal/30">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-royal" />
          Multiple doctors
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <label htmlFor="multi-doctor-launch" className="text-sm font-medium">Launch for all Premium clinics</label>
            <p className="text-xs text-muted-foreground">
              While off, only clinics with a pilot override can add doctors. Currently{" "}
              <strong>{saved.multi_doctor_enabled ? "launched" : "not launched"}</strong>.
            </p>
          </div>
          <Switch
            id="multi-doctor-launch"
            checked={saved.multi_doctor_enabled}
            disabled={!canManage || !loaded || saving}
            onCheckedChange={(v) => {
              setTyped("");
              setLaunchTarget(v);
            }}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label htmlFor="seat-price" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Price per extra doctor (₹/month)
            </label>
            <Input id="seat-price" inputMode="decimal" value={inputs.price} onChange={field("price")} disabled={!canManage} aria-invalid={!!errors.price} />
            {errors.price ? (
              <p className="text-xs text-destructive">{errors.price}</p>
            ) : (
              <p className="text-xs text-muted-foreground">While empty (unset), owners cannot buy extra doctor seats.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="seat-max" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Maximum doctors per clinic
            </label>
            <Input id="seat-max" inputMode="numeric" value={inputs.max} onChange={field("max")} disabled={!canManage} aria-invalid={!!errors.max} />
            {errors.max ? <p className="text-xs text-destructive">{errors.max}</p> : <p className="text-xs text-muted-foreground">2 to 50.</p>}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="seat-trial" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Extra doctors during trial
            </label>
            <Input id="seat-trial" inputMode="numeric" value={inputs.trial} onChange={field("trial")} disabled={!canManage} aria-invalid={!!errors.trial} />
            {errors.trial ? <p className="text-xs text-destructive">{errors.trial}</p> : <p className="text-xs text-muted-foreground">0 to 5.</p>}
          </div>
        </div>

        {canManage && (
          <Button size="sm" onClick={onSave} disabled={saving || !dirty || !loaded}>
            {saving ? "Saving…" : "Save settings"}
          </Button>
        )}

        <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Clinics with a pilot override</p>
            <p className="text-lg font-semibold" data-testid="override-count">{fmt(overrideCount)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Clinics with 2+ active doctors</p>
            <p className="text-lg font-semibold" data-testid="multi-count">{fmt(multiCount)}</p>
          </div>
        </div>
      </CardContent>

      <AlertDialog open={launchTarget !== null} onOpenChange={(o) => !o && closeLaunch()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{launchTarget ? "Launch Multiple doctors?" : "Switch off Multiple doctors?"}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              {launchTarget ? (
                <div className="space-y-3 text-sm">
                  <p>
                    Launching enables Multiple doctors for every Premium clinic, including clinics on a Premium trial. They can add
                    doctors up to the seats they have. This is logged to the Audit Log.
                  </p>
                  <div className="space-y-1.5">
                    <label htmlFor="launch-confirm" className="text-xs font-medium text-foreground">
                      Type LAUNCH to confirm
                    </label>
                    <Input id="launch-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
                  </div>
                </div>
              ) : (
                <p className="text-sm">
                  Clinics that already have extra doctors keep their doctors and all their data, but extra doctors stop taking
                  new bookings until it is switched on again. Pilot clinics keep access through their override.
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <Button
              onClick={confirmLaunch}
              disabled={saving || (launchTarget === true && typed !== "LAUNCH")}
              variant={launchTarget ? "default" : "destructive"}
            >
              {saving ? "Saving…" : launchTarget ? "Launch now" : "Switch off"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default SAMultiDoctorCard;
