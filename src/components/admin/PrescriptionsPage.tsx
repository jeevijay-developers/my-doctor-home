import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import {
  FileText, Plus, Search, Calendar, Pill, Stethoscope, User, Trash2, X, Pencil, Download, ClipboardList,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import PrescriptionSlip, { PrescriptionSlipData, VisitSummary, VitalsSummary } from "./PrescriptionSlip";
import { downloadPdfFromNode } from "@/lib/downloadPdfFromNode";
import { parseMedicineItems } from "@/lib/prescriptionMedicines";
import { useTrialStatus } from "@/contexts/TrialStatusContext";

type Prescription = {
  id: string; doctor_id: string; patient_id: string | null; patient_name: string;
  diagnosis: string | null; medications: string | null; notes: string | null;
  date: string; created_at: string; patient_age: number | null; patient_weight: number | null;
  visit_id: string | null; medicines: unknown;
  advice: string | null; diet_advice: string | null; lifestyle_advice: string | null;
  follow_up_date: string | null; follow_up_instructions: string | null;
};

const emptyForm = {
  patient_name: "", patient_id: "", diagnosis: "", medications: "", notes: "",
  date: format(new Date(), "yyyy-MM-dd"), patient_age: "", patient_weight: "",
};

// Compact read-only render of the structured medicine list, used in the
// table row summary and the detail Sheet — falls back to the legacy free
// text for prescriptions created before structured medicines existed.
const MedicineSummaryLine = ({ rx }: { rx: Prescription }) => {
  const items = parseMedicineItems(rx.medicines);
  if (items.length > 0) {
    const label = items.map((m) => m.name).join(", ");
    return <span className="line-clamp-1">{label}</span>;
  }
  return <span className="line-clamp-1">{rx.medications || "—"}</span>;
};

const PrescriptionsPage = () => {
  const { profile, isStaff, can } = useProfile();
  const { accessLevel: trialAccessLevel } = useTrialStatus();
  const writeDisabled = trialAccessLevel === "grace";
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [patients, setPatients] = useState<{ id: string; name: string; phone: string; gender: string | null }[]>([]);
  const [form, setForm] = useState(emptyForm);

  const [viewing, setViewing] = useState<Prescription | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(emptyForm);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkConfirmText, setBulkConfirmText] = useState("");

  const [slipOpen, setSlipOpen] = useState(false);
  const [slipPrescription, setSlipPrescription] = useState<PrescriptionSlipData | null>(null);

  const load = async () => {
    if (!profile) return;
    const { data } = await supabase
      .from("prescriptions")
      .select("*")
      .eq("doctor_id", profile.id)
      .order("date", { ascending: false });
    setPrescriptions((data || []) as Prescription[]);
  };

  const loadPatients = async () => {
    if (!profile) return;
    // Match the Patients page: only show patients with at least one completed visit.
    // Otherwise records the doctor believes are "deleted" (hidden from Patients) still surface here.
    const { data } = await supabase
      .from("patients")
      .select("id, name, phone, gender, total_visits")
      .eq("doctor_id", profile.id)
      .gt("total_visits", 0)
      .order("name");
    setPatients((data || []).map(({ id, name, phone, gender }) => ({ id, name, phone, gender })));
  };

  useEffect(() => { load(); loadPatients(); }, [profile]);

  const openSlip = async (rx: Prescription) => {
    let gender: string | null = null;
    if (rx.patient_id) {
      const { data } = await supabase.from("patients").select("gender").eq("id", rx.patient_id).maybeSingle();
      gender = data?.gender ?? null;
    }
    let visit: VisitSummary = null;
    let vitals: VitalsSummary = null;
    if (rx.visit_id) {
      const [{ data: v }, { data: vt }] = await Promise.all([
        supabase.from("patient_visits").select("visit_date, reason_for_visit, symptoms").eq("id", rx.visit_id).maybeSingle(),
        supabase.from("patient_vitals").select("blood_pressure, pulse, temperature, respiratory_rate, spo2, height, weight, bmi")
          .eq("visit_id", rx.visit_id).order("recorded_date", { ascending: false }).limit(1).maybeSingle(),
      ]);
      visit = (v as VisitSummary) || null;
      vitals = (vt as VitalsSummary) || null;
    }
    setSlipPrescription({
      id: rx.id,
      patient_id: rx.patient_id,
      patient_name: rx.patient_name,
      diagnosis: rx.diagnosis,
      medications: rx.medications,
      medicines: parseMedicineItems(rx.medicines),
      advice: rx.advice,
      diet_advice: rx.diet_advice,
      lifestyle_advice: rx.lifestyle_advice,
      follow_up_date: rx.follow_up_date,
      follow_up_instructions: rx.follow_up_instructions,
      date: rx.date,
      patient_age: rx.patient_age,
      patient_weight: rx.patient_weight,
      patient_gender: gender,
      visit,
      vitals,
    });
    setSlipOpen(true);
  };

  const downloadSlip = () => {
    if (!slipPrescription) return;
    downloadPdfFromNode('[data-prescription-slip-print-root] .slip-card', `prescription-${slipPrescription.id || "preview"}.pdf`, { multiPage: true });
  };

  // Keep patients list in sync with Patients section (add/delete/update)
  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel(`rx-patients-${profile.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "patients", filter: `doctor_id=eq.${profile.id}` },
        () => loadPatients()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile]);

  // Keep detail view in sync with latest data
  useEffect(() => {
    if (!viewing) return;
    const fresh = prescriptions.find((p) => p.id === viewing.id);
    if (fresh && fresh !== viewing) setViewing(fresh);
  }, [prescriptions]);

  const addPrescription = async () => {
    if (!profile || !form.patient_name) { toast.error("Patient name is required"); return; }
    if (form.patient_age && (Number(form.patient_age) < 0 || Number(form.patient_age) > 120)) {
      toast.error("Please enter a valid age (0–120)");
      return;
    }
    if (form.patient_weight && Number(form.patient_weight) < 0) {
      toast.error("Weight cannot be negative");
      return;
    }
    const { data, error } = await supabase.from("prescriptions").insert({
      doctor_id: profile.id,
      patient_id: form.patient_id || null,
      patient_name: form.patient_name,
      diagnosis: form.diagnosis || null,
      medications: form.medications || null,
      notes: form.notes || null,
      date: form.date,
      patient_age: form.patient_age ? Number(form.patient_age) : null,
      patient_weight: form.patient_weight ? Number(form.patient_weight) : null,
    }).select().single();
    if (error) { toast.error("Could not add prescription"); return; }
    setShowNew(false);
    setForm(emptyForm);
    load();
    toast.success("Prescription added");
    if (data) openSlip(data as Prescription);
  };

  const saveEdit = async () => {
    if (!viewing) return;
    if (!editForm.patient_name) { toast.error("Patient name is required"); return; }
    if (editForm.patient_age && (Number(editForm.patient_age) < 0 || Number(editForm.patient_age) > 120)) {
      toast.error("Please enter a valid age (0–120)");
      return;
    }
    if (editForm.patient_weight && Number(editForm.patient_weight) < 0) {
      toast.error("Weight cannot be negative");
      return;
    }
    const { error } = await supabase.from("prescriptions").update({
      patient_id: editForm.patient_id || null,
      patient_name: editForm.patient_name,
      diagnosis: editForm.diagnosis || null,
      medications: editForm.medications || null,
      notes: editForm.notes || null,
      date: editForm.date,
      patient_age: editForm.patient_age ? Number(editForm.patient_age) : null,
      patient_weight: editForm.patient_weight ? Number(editForm.patient_weight) : null,
    }).eq("id", viewing.id);
    if (error) { toast.error("Could not save changes"); return; }
    toast.success("Prescription updated");
    setEditing(false);
    load();
  };

  const startEdit = () => {
    if (!viewing) return;
    setEditForm({
      patient_name: viewing.patient_name,
      patient_id: viewing.patient_id || "",
      diagnosis: viewing.diagnosis || "",
      medications: viewing.medications || "",
      notes: viewing.notes || "",
      date: viewing.date,
      patient_age: viewing.patient_age != null ? String(viewing.patient_age) : "",
      patient_weight: viewing.patient_weight != null ? String(viewing.patient_weight) : "",
    });
    setEditing(true);
  };

  const selectPatient = (patientId: string) => {
    const p = patients.find(pt => pt.id === patientId);
    if (p) setForm({ ...form, patient_id: p.id, patient_name: p.name });
  };
  const selectEditPatient = (patientId: string) => {
    const p = patients.find(pt => pt.id === patientId);
    if (p) setEditForm({ ...editForm, patient_id: p.id, patient_name: p.name });
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());
  const exitSelectMode = () => { setSelectMode(false); clearSelection(); };
  const bulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    const { error } = await supabase.from("prescriptions").delete().in("id", ids);
    if (error) { toast.error("Could not delete prescriptions"); return; }
    toast.success(`${ids.length} prescription${ids.length === 1 ? "" : "s"} deleted`);
    setBulkDeleteOpen(false);
    setBulkConfirmText("");
    exitSelectMode();
    load();
  };

  const filtered = prescriptions.filter(p =>
    p.patient_name.toLowerCase().includes(search.toLowerCase()) ||
    (p.diagnosis || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-bold text-2xl text-primary flex items-center gap-2">
            <FileText className="h-6 w-6 text-ai-purple" /> Prescriptions
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{prescriptions.length} total records</p>
        </div>
        {can("prescriptions.create") && (
        <Dialog open={showNew} onOpenChange={(o) => { setShowNew(o); if (o) loadPatients(); else setForm(emptyForm); }}>
          <DialogTrigger asChild>
            <Button
              className="bg-royal hover:bg-royal/90"
              disabled={writeDisabled}
              title={writeDisabled ? "Upgrade to continue editing" : undefined}
            >
              <Plus className="h-4 w-4 mr-1" /> New Prescription
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Add Prescription</DialogTitle></DialogHeader>
            <div className="space-y-4">
              {patients.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Select Existing Patient</Label>
                  <Select value={form.patient_id} onValueChange={(v) => selectPatient(v)}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="-- Or type name below --" /></SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {patients.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.phone})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> Patient Name *</Label>
                  <Input value={form.patient_name} onChange={(e) => setForm({ ...form, patient_name: e.target.value })} className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Date</Label>
                  <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="h-10" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Age</Label>
                  <Input type="number" min={0} max={120} value={form.patient_age} onChange={(e) => setForm({ ...form, patient_age: e.target.value })} className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label>Weight (kg)</Label>
                  <Input type="number" min={0} step="0.1" value={form.patient_weight} onChange={(e) => setForm({ ...form, patient_weight: e.target.value })} className="h-10" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><Stethoscope className="h-3.5 w-3.5" /> Diagnosis</Label>
                <Input value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} placeholder="e.g. Acute bronchitis" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><Pill className="h-3.5 w-3.5" /> Medications</Label>
                <Textarea value={form.medications} onChange={(e) => setForm({ ...form, medications: e.target.value })} placeholder="List medications, dosage, frequency..." rows={3} />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Additional notes..." rows={2} />
              </div>
              <Button onClick={addPrescription} disabled={writeDisabled} className="w-full h-10 bg-royal hover:bg-royal/90">Save Prescription</Button>
            </div>
          </DialogContent>
        </Dialog>
        )}
      </div>

      <div className={`transition-opacity ${selectMode ? "opacity-60 pointer-events-none" : ""}`}>
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9 h-10" placeholder="Search by patient or diagnosis..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Select mode toggle */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {selectMode ? (
              <span>{selectedIds.size} of {filtered.length} selected</span>
            ) : (
              <span>{filtered.length} prescription{filtered.length === 1 ? "" : "s"}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selectMode && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => {
                  if (selectedIds.size === filtered.length) clearSelection();
                  else setSelectedIds(new Set(filtered.map((p) => p.id)));
                }}
              >
                {selectedIds.size === filtered.length ? "Deselect all" : `Select all ${filtered.length}`}
              </Button>
            )}
            {!isStaff && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant={selectMode ? "default" : "outline"}
                    className={`h-8 w-8 p-0 ${selectMode ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}`}
                    onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                    aria-pressed={selectMode}
                    aria-label={selectMode ? "Exit selection mode" : "Select items to delete"}
                  >
                    {selectMode ? <X className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{selectMode ? "Done" : "Select to delete"}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            )}
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <Card className="border-border/60 shadow-none">
          <CardContent className="py-16 text-center">
            <FileText className="h-12 w-12 text-ai-purple/20 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">No prescriptions yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Add your first prescription record</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Table — tablet/desktop */}
          <Card className="hidden md:block border-border/60 shadow-none overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/60 border-b border-border">
                  <tr className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {selectMode && <th className="pl-4 pr-2 py-3 w-10"></th>}
                    <th className="px-4 py-3">Patient</th>
                    <th className="px-4 py-3 hidden md:table-cell">Diagnosis</th>
                    <th className="px-4 py-3 hidden lg:table-cell">Medicines</th>
                    <th className="px-4 py-3 whitespace-nowrap">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((rx) => {
                    const isSelected = selectedIds.has(rx.id);
                    return (
                      <tr
                        key={rx.id}
                        className={`border-b border-border/60 last:border-0 cursor-pointer transition-colors ${
                          isSelected ? "bg-royal/5" : "hover:bg-secondary/40"
                        }`}
                        onClick={selectMode ? () => toggleSelected(rx.id) : () => setViewing(rx)}
                      >
                        {selectMode && (
                          <td className="pl-4 pr-2 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSelected(rx.id)}
                              aria-label={`Select prescription for ${rx.patient_name}`}
                              className="h-5 w-5 rounded"
                            />
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-ai-purple/10 flex items-center justify-center text-sm font-bold text-ai-purple flex-shrink-0">
                              {rx.patient_name?.charAt(0)?.toUpperCase() || "P"}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-foreground truncate">{rx.patient_name}</div>
                              <div className="text-xs text-muted-foreground md:hidden truncate">
                                {rx.diagnosis || "—"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden md:table-cell max-w-[220px]">
                          <div className="flex items-center gap-1.5">
                            <Stethoscope className="h-3.5 w-3.5 text-royal flex-shrink-0" />
                            <span className="truncate">{rx.diagnosis || "—"}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell max-w-[280px]">
                          <div className="flex items-start gap-1.5">
                            <Pill className="h-3.5 w-3.5 text-teal flex-shrink-0 mt-0.5" />
                            <MedicineSummaryLine rx={rx} />
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Badge variant="secondary" className="text-[10px] bg-secondary">{rx.date}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Cards — mobile */}
          <div className="md:hidden space-y-2">
            {filtered.map((rx) => {
              const isSelected = selectedIds.has(rx.id);
              return (
                <Card
                  key={rx.id}
                  className={`border-border/60 shadow-none cursor-pointer transition-colors ${isSelected ? "bg-royal/5 border-royal/30" : "hover:bg-secondary/40"}`}
                  onClick={selectMode ? () => toggleSelected(rx.id) : () => setViewing(rx)}
                >
                  <CardContent className="p-4 flex items-start gap-3">
                    {selectMode && (
                      <div onClick={(e) => e.stopPropagation()} className="pt-1">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelected(rx.id)}
                          aria-label={`Select prescription for ${rx.patient_name}`}
                          className="h-5 w-5 rounded"
                        />
                      </div>
                    )}
                    <div className="w-9 h-9 rounded-full bg-ai-purple/10 flex items-center justify-center text-sm font-bold text-ai-purple flex-shrink-0">
                      {rx.patient_name?.charAt(0)?.toUpperCase() || "P"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-foreground truncate">{rx.patient_name}</div>
                        <Badge variant="secondary" className="text-[10px] bg-secondary flex-shrink-0">{rx.date}</Badge>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                        <Stethoscope className="h-3.5 w-3.5 text-royal flex-shrink-0" />
                        <span className="truncate">{rx.diagnosis || "—"}</span>
                      </div>
                      <div className="flex items-start gap-1.5 text-xs text-muted-foreground mt-1">
                        <Pill className="h-3.5 w-3.5 text-teal flex-shrink-0 mt-0.5" />
                        <MedicineSummaryLine rx={rx} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Prescription detail sheet */}
      <Sheet open={!!viewing} onOpenChange={(o) => { if (!o) { setViewing(null); setEditing(false); } }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {viewing && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-ai-purple/10 flex items-center justify-center text-base font-bold text-ai-purple flex-shrink-0">
                    {viewing.patient_name?.charAt(0)?.toUpperCase() || "P"}
                  </div>
                  <div className="min-w-0">
                    <SheetTitle className="text-primary text-lg truncate">{viewing.patient_name}</SheetTitle>
                    <div className="text-xs text-muted-foreground mt-0.5">Issued {viewing.date}</div>
                  </div>
                </div>
              </SheetHeader>

              {!editing ? (
                <div className="mt-6 space-y-5">
                  <div>
                    <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><Stethoscope className="h-3.5 w-3.5" /> Diagnosis</Label>
                    <p className="text-sm text-foreground mt-1">{viewing.diagnosis || <span className="text-muted-foreground italic">Not specified</span>}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><Pill className="h-3.5 w-3.5" /> Medicines</Label>
                    {parseMedicineItems(viewing.medicines).length > 0 ? (
                      <ol className="mt-1.5 space-y-2">
                        {parseMedicineItems(viewing.medicines).map((m, i) => (
                          <li key={i} className="text-sm text-foreground">
                            <span className="font-medium">{i + 1}. {m.name}{m.strength ? ` — ${m.strength}` : ""}</span>
                            {(m.frequency || m.duration || m.timing || m.route) && (
                              <div className="text-xs text-muted-foreground pl-4">
                                {[m.frequency, m.duration, m.timing, m.route].filter(Boolean).join(" · ")}
                              </div>
                            )}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="text-sm text-foreground mt-1 whitespace-pre-line">{viewing.medications || <span className="text-muted-foreground italic">None recorded</span>}</p>
                    )}
                  </div>
                  {(viewing.advice || viewing.diet_advice || viewing.lifestyle_advice) && (
                    <div>
                      <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><ClipboardList className="h-3.5 w-3.5" /> Advice</Label>
                      <div className="text-sm text-foreground mt-1 space-y-1.5">
                        {viewing.advice && <p>{viewing.advice}</p>}
                        {viewing.diet_advice && <p><span className="text-muted-foreground">Diet:</span> {viewing.diet_advice}</p>}
                        {viewing.lifestyle_advice && <p><span className="text-muted-foreground">Lifestyle:</span> {viewing.lifestyle_advice}</p>}
                      </div>
                    </div>
                  )}
                  {(viewing.follow_up_date || viewing.follow_up_instructions) && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Follow-up</Label>
                      <p className="text-sm text-foreground mt-1">
                        {viewing.follow_up_date && <span className="font-medium">{viewing.follow_up_date}</span>}
                        {viewing.follow_up_date && viewing.follow_up_instructions && " — "}
                        {viewing.follow_up_instructions}
                      </p>
                    </div>
                  )}
                  <div>
                    <Label className="text-xs text-muted-foreground">Notes</Label>
                    <p className="text-sm text-foreground mt-1 whitespace-pre-line">{viewing.notes || <span className="text-muted-foreground italic">No notes</span>}</p>
                  </div>
                  <div className="pt-2 flex gap-2">
                    <Button variant="outline" className="flex-1 h-10" onClick={() => openSlip(viewing)}>
                      <Download className="h-4 w-4 mr-2" /> Download
                    </Button>
                    {can("prescriptions.edit") && (
                      <Button onClick={startEdit} className="flex-1 h-10 bg-royal hover:bg-royal/90">
                        <Pencil className="h-4 w-4 mr-2" /> Edit
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-6 space-y-4">
                  {patients.length > 0 && (
                    <div className="space-y-1.5">
                      <Label>Linked Patient</Label>
                      <Select value={editForm.patient_id} onValueChange={(v) => selectEditPatient(v)}>
                        <SelectTrigger className="h-10"><SelectValue placeholder="-- Or type name below --" /></SelectTrigger>
                        <SelectContent className="max-h-[200px]">
                          {patients.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.phone})</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> Patient Name *</Label>
                      <Input value={editForm.patient_name} onChange={(e) => setEditForm({ ...editForm, patient_name: e.target.value })} className="h-10" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Date</Label>
                      <Input type="date" value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} className="h-10" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Age</Label>
                      <Input type="number" min={0} max={120} value={editForm.patient_age} onChange={(e) => setEditForm({ ...editForm, patient_age: e.target.value })} className="h-10" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Weight (kg)</Label>
                      <Input type="number" min={0} step="0.1" value={editForm.patient_weight} onChange={(e) => setEditForm({ ...editForm, patient_weight: e.target.value })} className="h-10" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5"><Stethoscope className="h-3.5 w-3.5" /> Diagnosis</Label>
                    <Input value={editForm.diagnosis} onChange={(e) => setEditForm({ ...editForm, diagnosis: e.target.value })} className="h-10" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5"><Pill className="h-3.5 w-3.5" /> Medications</Label>
                    <Textarea value={editForm.medications} onChange={(e) => setEditForm({ ...editForm, medications: e.target.value })} rows={3} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Notes</Label>
                    <Textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={2} />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" className="flex-1 h-10" onClick={() => setEditing(false)}>Cancel</Button>
                    <Button onClick={saveEdit} disabled={writeDisabled} className="flex-1 h-10 bg-royal hover:bg-royal/90">Save Changes</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Floating bulk action bar */}
      {selectMode && selectedIds.size > 0 && (
        <div
          role="toolbar"
          aria-label="Bulk actions"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] sm:w-auto max-w-md"
        >
          <div className="bg-background/90 backdrop-blur-md border shadow-lg rounded-full px-4 sm:px-6 py-3 flex items-center gap-3 sm:gap-4">
            <span className="text-sm font-medium text-foreground whitespace-nowrap">
              {selectedIds.size} prescription{selectedIds.size === 1 ? "" : "s"} selected
            </span>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearSelection}>Clear</Button>
            <Button
              size="sm"
              className="h-8 text-xs bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-full px-4"
              onClick={() => { setBulkConfirmText(""); setBulkDeleteOpen(true); }}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete Selected
            </Button>
          </div>
        </div>
      )}

      {/* Bulk delete confirmation */}
      <AlertDialog
        open={bulkDeleteOpen}
        onOpenChange={(o) => { setBulkDeleteOpen(o); if (!o) setBulkConfirmText(""); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} prescription{selectedIds.size === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. These prescription records will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {selectedIds.size >= 10 && (
            <div className="space-y-1.5">
              <Label className="text-xs">
                To confirm, type <span className="font-mono font-semibold">{selectedIds.size}</span> below:
              </Label>
              <Input
                value={bulkConfirmText}
                onChange={(e) => setBulkConfirmText(e.target.value)}
                placeholder={String(selectedIds.size)}
                className="h-10"
                autoFocus
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={selectedIds.size >= 10 && bulkConfirmText.trim() !== String(selectedIds.size)}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground disabled:opacity-50"
              onClick={(e) => { e.preventDefault(); bulkDelete(); }}
            >
              Delete {selectedIds.size}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PrescriptionSlip
        open={slipOpen}
        onClose={() => setSlipOpen(false)}
        profile={profile}
        prescription={slipPrescription}
        onDownload={downloadSlip}
      />
    </div>
  );
};

export default PrescriptionsPage;
