import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import {
  FileText, Plus, Search, Calendar, Pill, Stethoscope, User, Trash2, X, Pencil, Download, ClipboardList,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DigitsInput } from "@/components/ui/digits-input";
import { AmountInput } from "@/components/ui/amount-input";
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
import { parseMedicineItems, type MedicineItem } from "@/lib/prescriptionMedicines";
import { useTrialStatus } from "@/contexts/TrialStatusContext";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import PaginationBar, { PAGE_SIZE } from "@/components/shared/PaginationBar";
import DateFilter from "@/components/shared/DateFilter";

const sanitizeSearchTerm = (term: string) => term.replace(/[,()%_]/g, " ").trim();

type Prescription = {
  id: string; doctor_id: string; patient_id: string | null; patient_name: string;
  diagnosis: string | null; medications: string | null; notes: string | null;
  date: string; created_at: string; patient_age: number | null; patient_weight: number | null;
  visit_id: string | null; medicines: unknown;
  advice: string | null; diet_advice: string | null; lifestyle_advice: string | null;
  follow_up_date: string | null; follow_up_instructions: string | null;
};

const emptyForm = {
  patient_name: "", patient_id: "", diagnosis: "",
  date: format(new Date(), "yyyy-MM-dd"), patient_age: "", patient_weight: "",
};

// Local, form-friendly mirror of MedicineItem — morning/afternoon/evening as
// booleans (checkboxes) and durationDays as a raw input string, converted
// to the stored 0/1 + number shape only at save time via toMedicineItems().
// `saved` is pure UI state (never persisted): false shows the full editable
// card, true collapses it to a one-line "1. Name" summary.
type MedicineFormItem = {
  name: string; strength: string;
  morning: boolean; afternoon: boolean; evening: boolean;
  durationDays: string; food: "before" | "after";
  saved: boolean;
};

const emptyMedicineFormItem = (): MedicineFormItem => ({
  name: "", strength: "", morning: false, afternoon: false, evening: false, durationDays: "", food: "after", saved: false,
});

// Existing medicines (opening an already-saved prescription for edit) start
// collapsed — they're already complete, so show the compact summary first.
const fromMedicineItems = (items: MedicineItem[]): MedicineFormItem[] =>
  items.map((m) => ({
    name: m.name, strength: m.strength,
    morning: m.morning === 1, afternoon: m.afternoon === 1, evening: m.evening === 1,
    durationDays: m.durationDays ? String(m.durationDays) : "",
    food: m.food,
    saved: true,
  }));

// Fully-empty rows (e.g. left over from clicking "+ Add Medicine" without
// filling it in) are silently dropped rather than saved or rejected.
const toMedicineItems = (items: MedicineFormItem[]): MedicineItem[] =>
  items
    .filter((m) => m.name.trim() || m.strength.trim() || m.durationDays.trim() || m.morning || m.afternoon || m.evening)
    .map((m) => ({
      name: m.name.trim(),
      strength: m.strength.trim(),
      morning: m.morning ? 1 : 0,
      afternoon: m.afternoon ? 1 : 0,
      evening: m.evening ? 1 : 0,
      durationDays: Number(m.durationDays) || 0,
      food: m.food,
    }));

// A row counts as "touched" if any field has content — only touched rows are
// validated; a row nobody filled in is simply dropped by toMedicineItems().
const validateMedicines = (items: MedicineFormItem[]): string | null => {
  for (const m of items) {
    const touched = m.name.trim() || m.strength.trim() || m.durationDays.trim() || m.morning || m.afternoon || m.evening;
    if (!touched) continue;
    if (!m.name.trim()) return "Enter a medicine name for each medicine.";
    if (!m.strength.trim()) return "Enter a strength/dose for each medicine.";
    const days = Number(m.durationDays);
    if (!m.durationDays.trim() || !Number.isFinite(days) || days <= 0) {
      return `Enter a valid duration (in days) for ${m.name.trim() || "each medicine"}.`;
    }
  }
  return null;
};

// Used by each medicine card's own "Save Medicine" button — validates just
// that one row before collapsing it to the summary line.
const validateSingleMedicine = (m: MedicineFormItem): string | null => {
  if (!m.name.trim()) return "Enter a medicine name.";
  if (!m.strength.trim()) return "Enter a strength/dose.";
  const days = Number(m.durationDays);
  if (!m.durationDays.trim() || !Number.isFinite(days) || days <= 0) return "Enter a valid duration (in days).";
  return null;
};

// One medicine's fields — used inside both the "New Prescription" dialog and
// the prescription Edit form. Renders as a compact "1. Name" summary line
// once saved, or the full editable card while being filled in/re-edited.
const MedicineRowEditor = ({
  item, index, onChange, onRemove,
}: {
  item: MedicineFormItem;
  index: number;
  onChange: (next: MedicineFormItem) => void;
  onRemove: () => void;
}) => {
  if (item.saved) {
    return (
      <Card className="border-border/60 shadow-none">
        <CardContent className="p-3 flex items-center justify-between gap-3">
          <button
            type="button"
            className="text-left flex-1 min-w-0"
            onClick={() => onChange({ ...item, saved: false })}
          >
            <div className="text-sm font-medium text-foreground truncate">
              {index + 1}. {item.name}{item.strength ? ` — ${item.strength}` : ""}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 truncate">
              {[
                `Morning-Afternoon-Evening: ${item.morning ? 1 : 0}-${item.afternoon ? 1 : 0}-${item.evening ? 1 : 0}`,
                item.durationDays && `${item.durationDays} day${item.durationDays === "1" ? "" : "s"}`,
                item.food === "before" ? "Before Food" : "After Food",
              ].filter(Boolean).join(" · ")}
            </div>
          </button>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => onChange({ ...item, saved: false })}
              aria-label={`Edit medicine ${index + 1}`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
              onClick={onRemove}
              aria-label={`Remove medicine ${index + 1}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const handleSaveMedicine = () => {
    const error = validateSingleMedicine(item);
    if (error) { toast.error(error); return; }
    onChange({ ...item, saved: true });
  };

  return (
    <Card className="border-border/60 shadow-none">
      <CardContent className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground">Medicine {index + 1}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
            onClick={onRemove}
            aria-label={`Remove medicine ${index + 1}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Medicine Name *</Label>
            <Input className="h-9" value={item.name} onChange={(e) => onChange({ ...item, name: e.target.value })} placeholder="e.g. Paracetamol" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Strength/Dose *</Label>
            <Input className="h-9" value={item.strength} onChange={(e) => onChange({ ...item, strength: e.target.value })} placeholder="e.g. 500 mg" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <Checkbox checked={item.morning} onCheckedChange={(c) => onChange({ ...item, morning: !!c })} /> Morning
          </label>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <Checkbox checked={item.afternoon} onCheckedChange={(c) => onChange({ ...item, afternoon: !!c })} /> Afternoon
          </label>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <Checkbox checked={item.evening} onCheckedChange={(c) => onChange({ ...item, evening: !!c })} /> Evening/Night
          </label>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Duration (days) *</Label>
            <DigitsInput className="h-9" maxLength={3} value={item.durationDays} onChange={(e) => onChange({ ...item, durationDays: e.target.value })} placeholder="e.g. 5" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Food Instruction *</Label>
            <Select value={item.food} onValueChange={(v: "before" | "after") => onChange({ ...item, food: v })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="before">Before Food</SelectItem>
                <SelectItem value="after">After Food</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button type="button" size="sm" className="h-9 bg-royal hover:bg-royal/90" onClick={handleSaveMedicine}>
          Save Medicine
        </Button>
      </CardContent>
    </Card>
  );
};

// The "+ Add Medicine" list — one instance rendered in the New Prescription
// dialog, another in the Edit form, each bound to its own state array.
const MedicinesEditor = ({
  items, onChange,
}: {
  items: MedicineFormItem[];
  onChange: (next: MedicineFormItem[]) => void;
}) => (
  <div className="space-y-1.5">
    <Label className="flex items-center gap-1.5"><Pill className="h-3.5 w-3.5" /> Medicines</Label>
    {items.length > 0 && (
      <div className="space-y-2.5">
        {items.map((m, i) => (
          <MedicineRowEditor
            key={i}
            item={m}
            index={i}
            onChange={(next) => onChange(items.map((p, pi) => (pi === i ? next : p)))}
            onRemove={() => onChange(items.filter((_, pi) => pi !== i))}
          />
        ))}
      </div>
    )}
    <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => onChange([...items, emptyMedicineFormItem()])}>
      <Plus className="h-3.5 w-3.5 mr-1" /> Add Medicine
    </Button>
  </div>
);

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
  const debouncedSearch = useDebouncedValue(search, 350);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dateFilterActive, setDateFilterActive] = useState(true);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [patients, setPatients] = useState<{ id: string; name: string; phone: string; gender: string | null }[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [formMedicines, setFormMedicines] = useState<MedicineFormItem[]>([]);

  const [viewing, setViewing] = useState<Prescription | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editFormMedicines, setEditFormMedicines] = useState<MedicineFormItem[]>([]);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkConfirmText, setBulkConfirmText] = useState("");

  const [slipOpen, setSlipOpen] = useState(false);
  const [slipPrescription, setSlipPrescription] = useState<PrescriptionSlipData | null>(null);

  const load = async () => {
    if (!profile) return;
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    let q = supabase.from("prescriptions").select("*", { count: "exact" }).eq("doctor_id", profile.id);
    if (dateFilterActive) q = q.eq("date", format(selectedDate, "yyyy-MM-dd"));
    const term = sanitizeSearchTerm(debouncedSearch);
    if (term) q = q.or(`patient_name.ilike.%${term}%,diagnosis.ilike.%${term}%`);
    q = q.order("date", { ascending: false }).range(from, to);
    const { data, count } = await q;
    setPrescriptions((data || []) as Prescription[]);
    setTotalCount(count ?? 0);
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

  // Reset to page 1 whenever the search term changes underneath the pager.
  useEffect(() => { setPage(1); }, [debouncedSearch, selectedDate, dateFilterActive]);

  useEffect(() => { load(); }, [profile, debouncedSearch, selectedDate, dateFilterActive, page]);
  useEffect(() => { loadPatients(); }, [profile]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    if (page > totalPages) setPage(totalPages);
  }, [totalCount, page]);

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
    downloadPdfFromNode(
      '[data-prescription-slip-print-root] [data-prescription-slip-body]',
      `prescription-${slipPrescription.id || "preview"}.pdf`,
      {
        multiPage: true,
        headerSelector: '[data-prescription-slip-print-root] [data-prescription-slip-header]',
        footerSelector: '[data-prescription-slip-print-root] [data-prescription-slip-footer]',
        rowSelector: '[data-prescription-slip-print-root] [data-prescription-slip-row]',
      }
    );
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
    const medError = validateMedicines(formMedicines);
    if (medError) { toast.error(medError); return; }
    const { data, error } = await supabase.from("prescriptions").insert({
      doctor_id: profile.id,
      patient_id: form.patient_id || null,
      patient_name: form.patient_name,
      diagnosis: form.diagnosis || null,
      medicines: toMedicineItems(formMedicines),
      date: form.date,
      patient_age: form.patient_age ? Number(form.patient_age) : null,
      patient_weight: form.patient_weight ? Number(form.patient_weight) : null,
    }).select().single();
    if (error) { toast.error("Could not add prescription"); return; }
    setShowNew(false);
    setForm(emptyForm);
    setFormMedicines([]);
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
    const medError = validateMedicines(editFormMedicines);
    if (medError) { toast.error(medError); return; }
    const { error } = await supabase.from("prescriptions").update({
      patient_id: editForm.patient_id || null,
      patient_name: editForm.patient_name,
      diagnosis: editForm.diagnosis || null,
      medicines: toMedicineItems(editFormMedicines),
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
      date: viewing.date,
      patient_age: viewing.patient_age != null ? String(viewing.patient_age) : "",
      patient_weight: viewing.patient_weight != null ? String(viewing.patient_weight) : "",
    });
    setEditFormMedicines(fromMedicineItems(parseMedicineItems(viewing.medicines)));
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

  // Search now happens server-side in load(), so the current page's rows
  // are already the filtered/paginated result set.
  const filtered = prescriptions;

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-bold text-2xl text-primary flex items-center gap-2">
            <FileText className="h-6 w-6 text-ai-purple" /> Prescriptions
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{totalCount} total records</p>
        </div>
        {can("prescriptions.create") && (
        <Dialog open={showNew} onOpenChange={(o) => { setShowNew(o); if (o) loadPatients(); else { setForm(emptyForm); setFormMedicines([]); } }}>
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
                  <DigitsInput maxLength={3} value={form.patient_age} onChange={(e) => setForm({ ...form, patient_age: e.target.value })} className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label>Weight (kg)</Label>
                  <AmountInput value={form.patient_weight} onChange={(e) => setForm({ ...form, patient_weight: e.target.value })} className="h-10" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><Stethoscope className="h-3.5 w-3.5" /> Diagnosis</Label>
                <Input value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} placeholder="e.g. Acute bronchitis" className="h-10" />
              </div>
              <MedicinesEditor items={formMedicines} onChange={setFormMedicines} />
              <Button onClick={addPrescription} disabled={writeDisabled} className="w-full h-10 bg-royal hover:bg-royal/90">Save Prescription</Button>
            </div>
          </DialogContent>
        </Dialog>
        )}
      </div>

      <DateFilter
        selectedDate={selectedDate}
        dateFilterActive={dateFilterActive}
        calendarOpen={calendarOpen}
        onCalendarOpenChange={setCalendarOpen}
        onDateChange={(date) => { setSelectedDate(date); setDateFilterActive(true); setCalendarOpen(false); }}
        onClear={() => setDateFilterActive(false)}
        activeLabel="Showing prescriptions"
        inactiveLabel="Showing all prescriptions"
      />

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
              <span>{selectedIds.size} of {filtered.length} selected on this page</span>
            ) : (
              <span>{filtered.length} prescription{filtered.length === 1 ? "" : "s"} on this page</span>
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
                {selectedIds.size === filtered.length ? "Deselect all" : `Select all ${filtered.length} on this page`}
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
                            <div className="text-xs text-muted-foreground pl-4">
                              {[
                                `Morning-Afternoon-Evening: ${m.morning}-${m.afternoon}-${m.evening}`,
                                m.durationDays > 0 && `${m.durationDays} day${m.durationDays === 1 ? "" : "s"}`,
                                m.food === "before" ? "Before Food" : "After Food",
                              ].filter(Boolean).join(" · ")}
                            </div>
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
                  {viewing.notes && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Notes</Label>
                      <p className="text-sm text-foreground mt-1 whitespace-pre-line">{viewing.notes}</p>
                    </div>
                  )}
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
                      <DigitsInput maxLength={3} value={editForm.patient_age} onChange={(e) => setEditForm({ ...editForm, patient_age: e.target.value })} className="h-10" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Weight (kg)</Label>
                      <AmountInput value={editForm.patient_weight} onChange={(e) => setEditForm({ ...editForm, patient_weight: e.target.value })} className="h-10" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5"><Stethoscope className="h-3.5 w-3.5" /> Diagnosis</Label>
                    <Input value={editForm.diagnosis} onChange={(e) => setEditForm({ ...editForm, diagnosis: e.target.value })} className="h-10" />
                  </div>
                  <MedicinesEditor items={editFormMedicines} onChange={setEditFormMedicines} />
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
