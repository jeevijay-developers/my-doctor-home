// Visits reuse the existing appointments table for linkage (no duplicate
// patient/appointment records are created) — an appointment can optionally be
// attached to a visit via appointment_id. Vitals are 1:1 with a visit and are
// edited inline in the same dialog rather than as a separate tab, since the
// spec's tab list has no standalone "Vitals" tab.
import { useEffect, useState } from "react";
import { CalendarClock, Plus, Pencil, Trash2, ChevronDown, ChevronUp, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { dbErrorMessage } from "@/lib/dbErrorMessage";

type Visit = {
  id: string; visit_date: string; consultation_type: string | null; reason_for_visit: string | null;
  symptoms: string | null; diagnosis: string | null; doctor_notes: string | null; follow_up_date: string | null;
  appointment_id: string | null;
};
type Vitals = {
  id?: string; visit_id: string; blood_pressure: string | null; pulse: number | null; temperature: number | null;
  weight: number | null; height: number | null; spo2: number | null; respiratory_rate: number | null; bmi: number | null;
};
type Appt = { id: string; date: string; service_name: string | null; appointment_type: string | null };

const emptyVisit = {
  appointment_id: "", visit_date: new Date().toISOString().slice(0, 10), consultation_type: "",
  reason_for_visit: "", symptoms: "", diagnosis: "", doctor_notes: "", follow_up_date: "",
};
const emptyVitals = { blood_pressure: "", pulse: "", temperature: "", weight: "", height: "", spo2: "", respiratory_rate: "" };

const VisitsTab = ({ patientId, doctorId, patientPhone, onChange }: {
  patientId: string; doctorId: string; patientPhone: string; onChange?: () => void;
}) => {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [vitalsByVisit, setVitalsByVisit] = useState<Record<string, Vitals>>({});
  const [appointments, setAppointments] = useState<Appt[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyVisit);
  const [vitalsForm, setVitalsForm] = useState(emptyVitals);
  const [deleting, setDeleting] = useState<Visit | null>(null);

  const load = async () => {
    const { data: v } = await supabase.from("patient_visits").select("*").eq("patient_id", patientId).is("deleted_at", null).order("visit_date", { ascending: false });
    setVisits((v || []) as Visit[]);
    const { data: vt } = await supabase.from("patient_vitals").select("*").eq("patient_id", patientId);
    const map: Record<string, Vitals> = {};
    for (const row of (vt || []) as Vitals[]) map[row.visit_id] = row;
    setVitalsByVisit(map);
    if (patientPhone) {
      const { data: appts } = await supabase.from("appointments").select("id, date, service_name, appointment_type").eq("doctor_id", doctorId).eq("patient_phone", patientPhone).order("date", { ascending: false });
      setAppointments((appts || []) as Appt[]);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [patientId]);

  const toggleExpand = (id: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const openAdd = () => { setEditingId(null); setForm(emptyVisit); setVitalsForm(emptyVitals); setDialogOpen(true); };
  const openEdit = (v: Visit) => {
    setEditingId(v.id);
    setForm({
      appointment_id: v.appointment_id || "", visit_date: v.visit_date, consultation_type: v.consultation_type || "",
      reason_for_visit: v.reason_for_visit || "", symptoms: v.symptoms || "", diagnosis: v.diagnosis || "",
      doctor_notes: v.doctor_notes || "", follow_up_date: v.follow_up_date || "",
    });
    const vt = vitalsByVisit[v.id];
    setVitalsForm(vt ? {
      blood_pressure: vt.blood_pressure || "", pulse: vt.pulse?.toString() || "", temperature: vt.temperature?.toString() || "",
      weight: vt.weight?.toString() || "", height: vt.height?.toString() || "", spo2: vt.spo2?.toString() || "",
      respiratory_rate: vt.respiratory_rate?.toString() || "",
    } : emptyVitals);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.visit_date) { toast.error("Visit date is required"); return; }
    const visitPayload = {
      appointment_id: form.appointment_id || null, visit_date: form.visit_date,
      consultation_type: form.consultation_type || null, reason_for_visit: form.reason_for_visit || null,
      symptoms: form.symptoms || null, diagnosis: form.diagnosis || null,
      doctor_notes: form.doctor_notes || null, follow_up_date: form.follow_up_date || null,
    };
    let visitId = editingId;
    if (editingId) {
      const { error } = await supabase.from("patient_visits").update({ ...visitPayload, updated_by: doctorId }).eq("id", editingId);
      if (error) { toast.error(dbErrorMessage(error, "patient_visits update", "Could not save visit")); return; }
    } else {
      const { data, error } = await supabase.from("patient_visits").insert({
        ...visitPayload, patient_id: patientId, doctor_id: doctorId, created_by: doctorId, updated_by: doctorId,
      }).select("id").single();
      if (error || !data) { toast.error(error ? dbErrorMessage(error, "patient_visits insert", "Could not save visit") : "Could not save visit"); return; }
      visitId = data.id;
    }

    const hasVitals = Object.values(vitalsForm).some((v) => v.trim() !== "");
    if (hasVitals && visitId) {
      const weight = vitalsForm.weight ? Number(vitalsForm.weight) : null;
      const height = vitalsForm.height ? Number(vitalsForm.height) : null;
      const bmi = weight && height ? Number((weight / ((height / 100) ** 2)).toFixed(1)) : null;
      const vitalsPayload = {
        blood_pressure: vitalsForm.blood_pressure || null,
        pulse: vitalsForm.pulse ? Number(vitalsForm.pulse) : null,
        temperature: vitalsForm.temperature ? Number(vitalsForm.temperature) : null,
        weight, height,
        spo2: vitalsForm.spo2 ? Number(vitalsForm.spo2) : null,
        respiratory_rate: vitalsForm.respiratory_rate ? Number(vitalsForm.respiratory_rate) : null,
        bmi,
      };
      const existing = vitalsByVisit[visitId];
      if (existing?.id) {
        await supabase.from("patient_vitals").update(vitalsPayload).eq("id", existing.id);
      } else {
        await supabase.from("patient_vitals").insert({
          ...vitalsPayload, visit_id: visitId, patient_id: patientId, doctor_id: doctorId, created_by: doctorId,
        });
      }
    }

    toast.success(editingId ? "Visit updated successfully." : "Visit logged successfully.");
    setDialogOpen(false);
    load();
    onChange?.();
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const { error } = await supabase.from("patient_visits").update({ deleted_at: new Date().toISOString() }).eq("id", deleting.id);
    if (error) { toast.error(dbErrorMessage(error, "patient_visits soft-delete", "Could not remove visit")); return; }
    toast.success("Visit removed");
    setDeleting(null);
    load();
    onChange?.();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-heading font-semibold text-foreground flex items-center gap-2">
          <CalendarClock className="h-4.5 w-4.5 text-warning" /> Visits
          {visits.length > 0 && <Badge variant="secondary" className="text-[10px]">{visits.length}</Badge>}
        </h3>
        <Button size="sm" onClick={openAdd} className="bg-royal hover:bg-royal/90 h-8 text-xs">
          <Plus className="h-3.5 w-3.5 mr-1" /> Log Visit
        </Button>
      </div>

      {visits.length === 0 ? (
        <Card className="border-border/60 shadow-none">
          <CardContent className="py-10 text-center">
            <CalendarClock className="h-9 w-9 mx-auto mb-2 opacity-20 text-warning" />
            <p className="text-sm text-muted-foreground font-medium">No visits logged</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Log a visit to start building the clinical record</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {visits.map((v) => {
            const vt = vitalsByVisit[v.id];
            const isOpen = expanded.has(v.id);
            return (
              <Card key={v.id} className="border-border/60 shadow-none">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3 cursor-pointer" onClick={() => toggleExpand(v.id)}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-foreground">{v.visit_date}</span>
                        {v.consultation_type && <Badge variant="secondary" className="text-[10px]">{v.consultation_type}</Badge>}
                      </div>
                      {v.reason_for_visit && <p className="text-xs text-muted-foreground mt-1 truncate">{v.reason_for_visit}</p>}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); openEdit(v); }} aria-label="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); setDeleting(v); }} aria-label="Remove">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>
                  {isOpen && (
                    <div className="mt-3 pt-3 border-t border-border/60 space-y-3 text-xs">
                      {v.symptoms && <p><span className="text-muted-foreground">Symptoms: </span><span className="text-foreground">{v.symptoms}</span></p>}
                      {v.diagnosis && <p><span className="text-muted-foreground">Diagnosis: </span><span className="text-foreground">{v.diagnosis}</span></p>}
                      {v.doctor_notes && <p><span className="text-muted-foreground">Doctor Notes: </span><span className="text-foreground">{v.doctor_notes}</span></p>}
                      {v.follow_up_date && <p><span className="text-muted-foreground">Follow-up: </span><span className="text-foreground">{v.follow_up_date}</span></p>}
                      {vt && (
                        <div>
                          <div className="flex items-center gap-1.5 text-muted-foreground mb-1.5"><Activity className="h-3.5 w-3.5" /> Vitals</div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {[
                              ["BP", vt.blood_pressure], ["Pulse", vt.pulse && `${vt.pulse} bpm`], ["Temp", vt.temperature && `${vt.temperature}°F`],
                              ["SpO2", vt.spo2 && `${vt.spo2}%`], ["Weight", vt.weight && `${vt.weight} kg`], ["Height", vt.height && `${vt.height} cm`],
                              ["Resp. Rate", vt.respiratory_rate && `${vt.respiratory_rate}/min`], ["BMI", vt.bmi],
                            ].filter(([, val]) => val).map(([label, val]) => (
                              <div key={label as string} className="bg-secondary rounded-lg p-2">
                                <div className="text-[10px] text-muted-foreground">{label}</div>
                                <div className="font-medium text-foreground">{val}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "Edit Visit" : "Log Visit"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {appointments.length > 0 && (
              <div className="space-y-1.5">
                <Label>Link to Existing Appointment (optional)</Label>
                <Select value={form.appointment_id} onValueChange={(v) => setForm({ ...form, appointment_id: v })}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="-- None --" /></SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {appointments.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.date} — {a.service_name || a.appointment_type || "Appointment"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Visit Date *</Label>
                <Input type="date" value={form.visit_date} onChange={(e) => setForm({ ...form, visit_date: e.target.value })} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label>Consultation Type</Label>
                <Input value={form.consultation_type} placeholder="e.g. In-person, Online" onChange={(e) => setForm({ ...form, consultation_type: e.target.value })} className="h-10" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reason for Visit</Label>
              <Input value={form.reason_for_visit} onChange={(e) => setForm({ ...form, reason_for_visit: e.target.value })} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label>Symptoms</Label>
              <Textarea value={form.symptoms} rows={2} onChange={(e) => setForm({ ...form, symptoms: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Diagnosis</Label>
              <Textarea value={form.diagnosis} rows={2} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Doctor Notes</Label>
              <Textarea value={form.doctor_notes} rows={2} onChange={(e) => setForm({ ...form, doctor_notes: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Follow-up Date</Label>
              <Input type="date" value={form.follow_up_date} onChange={(e) => setForm({ ...form, follow_up_date: e.target.value })} className="h-10" />
            </div>

            <div className="pt-2 border-t border-border">
              <Label className="flex items-center gap-1.5 mb-3"><Activity className="h-4 w-4" /> Vitals (optional)</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1"><Label className="text-xs">Blood Pressure</Label><Input placeholder="120/80" value={vitalsForm.blood_pressure} onChange={(e) => setVitalsForm({ ...vitalsForm, blood_pressure: e.target.value })} className="h-9" /></div>
                <div className="space-y-1"><Label className="text-xs">Pulse (bpm)</Label><Input type="number" value={vitalsForm.pulse} onChange={(e) => setVitalsForm({ ...vitalsForm, pulse: e.target.value })} className="h-9" /></div>
                <div className="space-y-1"><Label className="text-xs">Temp (°F)</Label><Input type="number" value={vitalsForm.temperature} onChange={(e) => setVitalsForm({ ...vitalsForm, temperature: e.target.value })} className="h-9" /></div>
                <div className="space-y-1"><Label className="text-xs">SpO2 (%)</Label><Input type="number" value={vitalsForm.spo2} onChange={(e) => setVitalsForm({ ...vitalsForm, spo2: e.target.value })} className="h-9" /></div>
                <div className="space-y-1"><Label className="text-xs">Weight (kg)</Label><Input type="number" value={vitalsForm.weight} onChange={(e) => setVitalsForm({ ...vitalsForm, weight: e.target.value })} className="h-9" /></div>
                <div className="space-y-1"><Label className="text-xs">Height (cm)</Label><Input type="number" value={vitalsForm.height} onChange={(e) => setVitalsForm({ ...vitalsForm, height: e.target.value })} className="h-9" /></div>
                <div className="space-y-1"><Label className="text-xs">Resp. Rate</Label><Input type="number" value={vitalsForm.respiratory_rate} onChange={(e) => setVitalsForm({ ...vitalsForm, respiratory_rate: e.target.value })} className="h-9" /></div>
              </div>
            </div>

            <Button onClick={save} className="w-full h-10 bg-royal hover:bg-royal/90">{editingId ? "Save Changes" : "Log Visit"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this visit?</AlertDialogTitle>
            <AlertDialogDescription>It will be hidden from the patient's medical record, including its vitals. This does not permanently erase it.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default VisitsTab;
