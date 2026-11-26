import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Practitioner } from "@/lib/practitioners/types";
import { hoursFor } from "@/lib/practitioners/hours";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type DayRow = {
  id?: string; day_of_week: number; is_open: boolean;
  start_time: string | null; end_time: string | null; start_time_2: string | null; end_time_2: string | null;
  practitioner_id?: string | null;
};

const closedDay = (d: number): DayRow => ({
  day_of_week: d, is_open: false, start_time: null, end_time: null, start_time_2: null, end_time_2: null,
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  practitioner: Practitioner | null;
  clinicId: string;
}

// One doctor's weekly hours: the same morning/evening grid as My Website's Working Hours.
const DoctorHoursEditor = ({ open, onOpenChange, practitioner, clinicId }: Props) => {
  const [days, setDays] = useState<DayRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const practitionerId = practitioner?.id ?? null;

  useEffect(() => {
    if (!open || !practitionerId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    (async () => {
      const { data, error } = await supabase.from("working_hours").select("*").eq("doctor_id", clinicId).order("day_of_week");
      if (cancelled) return;
      if (error) {
        // Never show (and let Save write) an all-closed week that is really just a failed load.
        console.error("Could not load working hours:", error);
        setDays([]);
        setLoadError(true);
        setLoading(false);
        return;
      }
      const mine = hoursFor((data ?? []) as DayRow[], practitionerId);
      setDays(DAY_NAMES.map((_, d) => mine.find((r) => r.day_of_week === d) ?? closedDay(d)));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, practitionerId, clinicId, reloadKey]);

  const update = (d: number, field: keyof DayRow, value: string | boolean | null) =>
    setDays((prev) => prev.map((r) => (r.day_of_week === d ? { ...r, [field]: value } : r)));

  const save = async () => {
    if (!practitionerId || loadError || loading) return;
    for (const r of days) {
      if (!r.is_open) continue;
      if (!r.start_time || !r.end_time || r.end_time <= r.start_time) {
        toast.error(`${DAY_NAMES[r.day_of_week]}: set a morning start and an end time after it.`);
        return;
      }
      if ((r.start_time_2 || r.end_time_2) && (!r.start_time_2 || !r.end_time_2 || r.end_time_2 <= r.start_time_2)) {
        toast.error(`${DAY_NAMES[r.day_of_week]}: set both evening times, with the end after the start.`);
        return;
      }
    }
    setSaving(true);
    try {
      for (const r of days) {
        const fields = {
          is_open: r.is_open, start_time: r.start_time, end_time: r.end_time,
          start_time_2: r.start_time_2 || null, end_time_2: r.end_time_2 || null,
        };
        const { error } = r.id
          ? await supabase.from("working_hours").update(fields).eq("id", r.id)
          : await supabase.from("working_hours").insert({
              ...fields, doctor_id: clinicId, practitioner_id: practitionerId, day_of_week: r.day_of_week,
            });
        if (error) {
          toast.error(`Could not save ${DAY_NAMES[r.day_of_week]}'s hours. Please try again.`);
          return;
        }
      }
      toast.success("Working hours saved");
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Working hours{practitioner ? ` · ${practitioner.display_name}` : ""}</DialogTitle>
          <DialogDescription>When this doctor sees patients. Booking slots follow these hours.</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-royal" /></div>
        ) : loadError ? (
          <div role="alert" className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm text-destructive">Could not load this doctor's working hours.</p>
            <Button variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)}>Retry</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {days.map((wh) => {
              const day = DAY_NAMES[wh.day_of_week];
              return (
                <div key={wh.day_of_week} className="p-3 rounded-lg bg-secondary space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-primary">{day}</span>
                    <Switch aria-label={`${day} open`} checked={wh.is_open} onCheckedChange={(v) => update(wh.day_of_week, "is_open", v)} />
                  </div>
                  {wh.is_open && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div><Label className="text-xs">Morning Start</Label><Input type="time" aria-label={`${day} morning start`} value={wh.start_time || ""} onChange={(e) => update(wh.day_of_week, "start_time", e.target.value || null)} /></div>
                        <div><Label className="text-xs">Morning End</Label><Input type="time" aria-label={`${day} morning end`} value={wh.end_time || ""} onChange={(e) => update(wh.day_of_week, "end_time", e.target.value || null)} /></div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div><Label className="text-xs">Evening Start</Label><Input type="time" aria-label={`${day} evening start`} value={wh.start_time_2 || ""} onChange={(e) => update(wh.day_of_week, "start_time_2", e.target.value || null)} /></div>
                        <div><Label className="text-xs">Evening End</Label><Input type="time" aria-label={`${day} evening end`} value={wh.end_time_2 || ""} onChange={(e) => update(wh.day_of_week, "end_time_2", e.target.value || null)} /></div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button className="bg-royal hover:bg-royal/90" onClick={save} disabled={saving || loading || loadError}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Save hours
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DoctorHoursEditor;
