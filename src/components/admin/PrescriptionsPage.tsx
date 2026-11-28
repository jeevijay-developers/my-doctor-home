import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import {
  FileText, Plus, Search, Pill, Stethoscope, Trash2, Pencil, Download, ClipboardList, Eye, MessageCircle, LayoutTemplate,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DigitsInput } from "@/components/ui/digits-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import PrescriptionShare from "./PrescriptionShare";
import PrescriptionSlip, { PrescriptionSlipCard, PrescriptionSlipData, VisitSummary, VitalsSummary } from "./PrescriptionSlip";
import { downloadPdfFromNode } from "@/lib/downloadPdfFromNode";
import { pdfFileName } from "@/lib/pdfFileName";
import { parseMedicineItems, type MedicineItem } from "@/lib/prescriptionMedicines";
import { useTrialStatus } from "@/contexts/TrialStatusContext";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import PaginationBar, { PAGE_SIZE } from "@/components/shared/PaginationBar";
import DateFilter from "@/components/shared/DateFilter";
import PrescriptionPatientFields from "./PrescriptionPatientFields";
import BulkSelectionBar from "./BulkSelectionBar";
import NameButton from "./NameButton";
import { prescriptionVitalsError } from "@/lib/prescriptionPatient";
import { parseWeight } from "@/lib/patientIntake";
import { buildShareMessage, buildWhatsAppUrl, prescriptionShareUrl } from "@/lib/prescriptionShare";
import { usePractitioners } from "@/hooks/usePractitioners";
import PractitionerSelect, { ALL_DOCTORS } from "./PractitionerSelect";
import { Badge } from "@/components/ui/badge";
import { slipDoctor } from "@/lib/practitioners/slipDoctor";
import { practitionerErrorMessage } from "@/lib/practitioners/errors";
import { usePrescriptionTemplates } from "@/hooks/usePrescriptionTemplates";
import { adviceEnabled, blockEnabled, parseTemplateConfig, showsComplaint, showsDiagnosis, vitalFields } from "@/lib/prescriptionTemplate/config";
import { defaultTemplateConfig } from "@/lib/prescriptionTemplate/defaults";
import { carryForwardValues, cleanExtra, hasCarryForward, isEmptyValue, parseExtra, validateExtra } from "@/lib/prescriptionTemplate/extra";
import { sysVitalKey, ADVICE_COLUMNS, ADVICE_KEYS, SYS_COMPLAINT, SYS_PREFIX, SYS_SYMPTOMS } from "@/lib/prescriptionTemplate/types";
import { cleanVital } from "@/lib/prescriptionTemplate/vitals";
import { pickDefaultTemplate, templatesForDoctor } from "@/lib/prescriptionTemplate/resolve";
import type { TemplateConfig } from "@/lib/prescriptionTemplate/types";
import TemplateFormFields from "./prescription-template/TemplateFormFields";
import TemplateAnswersView from "./prescription-template/TemplateAnswersView";
import PrescriptionTemplatesDialog from "./prescription-template/PrescriptionTemplatesDialog";

// Select value for "no custom template" (Radix Select items cannot have an empty value).
const STANDARD_TEMPLATE = "__standard";

const sanitizeSearchTerm = (term: string) => term.replace(/[,()%_]/g, " ").trim();

type Prescription = {
  id: string; doctor_id: string; patient_id: string | null; patient_name: string;
  diagnosis: string | null; medications: string | null; notes: string | null;
  date: string; created_at: string; patient_age: number | null; patient_weight: number | null;
  visit_id: string | null; medicines: unknown;
  advice: string | null; diet_advice: string | null; lifestyle_advice: string | null;
  follow_up_date: string | null; follow_up_instructions: string | null;
  practitioner_id?: string | null;
  // Template fields (null/absent on prescriptions written before templates existed).
  extra?: unknown; template_id?: string | null; template_snapshot?: unknown;
};

const emptyForm = {
  patient_name: "", patient_id: "", diagnosis: "",
  date: format(new Date(), "yyyy-MM-dd"), patient_age: "", patient_weight: "",
  advice: "", diet_advice: "", lifestyle_advice: "", follow_up_date: "", follow_up_instructions: "",
};

// The columns a template's sections write besides patient/date/age/weight, for a prescription
// being saved. Sections the template has switched off write nothing. On insert an empty value is
// left out entirely (so a clinic without templates sends exactly what it always did); on update
// it is sent as null so the doctor can clear it.
const templateColumns = (
  config: TemplateConfig,
  f: typeof emptyForm,
  mode: "insert" | "update",
  // The saved row being edited: on update a column is only sent when the doctor changed it, so
  // an edit never overwrites advice or follow-up written elsewhere in the meantime.
  prev?: Record<string, unknown>,
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  const put = (key: string, value: string) => {
    if (mode === "update") {
      const before = typeof prev?.[key] === "string" ? (prev[key] as string) : "";
      if (value === before) return;
    }
    const v = value.trim();
    if (v) out[key] = v;
    else if (mode === "update") out[key] = null;
  };
  // Only the kinds of advice the template offers are written.
  for (const k of ADVICE_KEYS) {
    if (adviceEnabled(config, k)) put(ADVICE_COLUMNS[k], f[ADVICE_COLUMNS[k]]);
  }
  if (blockEnabled(config, "follow_up")) {
    put("follow_up_date", f.follow_up_date);
    put("follow_up_instructions", f.follow_up_instructions);
  }
  return out;
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
  const { profile, isStaff, can, role, myPractitionerId } = useProfile();
  const { isMulti, byId, practitioners } = usePractitioners();
  // A doctor login writes as themselves only (RLS enforces it; the database fills the author in).
  // Everyone else who may write a prescription (the owner, reception) names the prescribing doctor
  // explicitly: the owner has their own doctor row too, so "the caller" is NOT a safe default.
  const isDoctorLogin = role === "doctor" && !!myPractitionerId;
  const needsDoctorPick = isMulti && !isDoctorLogin;
  const drName = (name: string) => `Dr. ${name.trim().replace(/^dr\.?\s+/i, "")}`;
  // RLS is the real guard: in a multi-doctor clinic only the author or the owner may change a prescription.
  // Only the owner may re-assign a prescription to another doctor (RLS refuses a doctor login).
  const ownerEditsDoctor = isMulti && role === "owner";
  const canChangeRx = (rx: Prescription) =>
    !isMulti || role === "owner" || (!!myPractitionerId && rx.practitioner_id === myPractitionerId);
  const [doctorFilter, setDoctorFilter] = useState<string>(ALL_DOCTORS);
  const [rxDoctor, setRxDoctor] = useState<string | null>(null);
  const [rxDoctorHint, setRxDoctorHint] = useState<string | null>(null);
  const [editDoctor, setEditDoctor] = useState<string | null>(null);
  // A doctor chosen by hand is never overwritten by a late "last visit" suggestion.
  const doctorTouched = useRef(false);
  const suggestSeq = useRef(0);
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
  const [form, setForm] = useState(emptyForm);
  const [formMedicines, setFormMedicines] = useState<MedicineFormItem[]>([]);
  const [formExtra, setFormExtra] = useState<Record<string, unknown>>({});

  const [viewing, setViewing] = useState<Prescription | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editFormMedicines, setEditFormMedicines] = useState<MedicineFormItem[]>([]);
  const [editExtra, setEditExtra] = useState<Record<string, unknown>>({});

  // Prescription templates: which layout and extra fields a new prescription uses. A clinic with
  // no templates (or whose templates failed to load) always uses the standard slip.
  const templatesApi = usePrescriptionTemplates(profile?.id);
  const { templates } = templatesApi;
  const canManageTemplates = !isStaff || (role === "doctor" && !!myPractitionerId && can("prescriptions.edit"));
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [formTemplateId, setFormTemplateId] = useState<string | null>(null);
  const templateTouched = useRef(false);
  const formDoctor = needsDoctorPick ? rxDoctor : myPractitionerId;
  const availableTemplates = useMemo(() => templatesForDoctor(templates, formDoctor), [templates, formDoctor]);
  // A template chosen by hand stays in use even if a later change of prescribing doctor takes it out of
  // that doctor's own list, so answers already typed are not silently discarded.
  const formTemplate = templates.find((t) => t.id === formTemplateId) ?? null;
  const pickerTemplates = formTemplate && !availableTemplates.some((t) => t.id === formTemplate.id)
    ? [...availableTemplates, formTemplate]
    : availableTemplates;
  const formConfig = useMemo(() => formTemplate?.config ?? defaultTemplateConfig(), [formTemplate]);
  // An edited prescription keeps the layout it was issued with.
  const editConfig = useMemo(() => parseTemplateConfig(viewing?.template_snapshot), [viewing?.template_snapshot]);
  // Values filled in automatically, by where they came from: "visit" (the patient's visit of the prescription's
  // date) and "carry" (the patient's last prescription). They are patient-specific, so they are tracked to be
  // removed again when the patient (or, for the visit, the date) changes.
  const autoFilled = useRef<{ visit: Record<string, unknown>; carry: Record<string, unknown> }>({ visit: {}, carry: {} });
  const formExtraRef = useRef(formExtra);
  formExtraRef.current = formExtra;

  // Starts on the doctor's default template; re-picked when the prescribing doctor changes unless the user chose a
  // template by hand. Once the doctor has TYPED answers the template is never switched automatically (they would be
  // lost); values filled in automatically do not count as typed.
  useEffect(() => {
    if (!showNew || templateTouched.current) return;
    const auto = { ...autoFilled.current.visit, ...autoFilled.current.carry };
    const typed = Object.entries(formExtraRef.current).some(
      ([k, v]) => !isEmptyValue(v) && JSON.stringify(v) !== JSON.stringify(auto[k]),
    );
    if (typed) return;
    setFormTemplateId(pickDefaultTemplate(templates, formDoctor)?.id ?? null);
  }, [showNew, templates, formDoctor]);

  // Another patient: nothing about the previous one may stay on the form. That is everything filled in
  // automatically (even if edited since), and the patient-specific answers the doctor typed: complaint, symptoms,
  // vitals and the carry-forward fields. Starting a form (no previous patient) keeps what was typed so far.
  const previousPatient = useRef("");
  useEffect(() => {
    const before = previousPatient.current;
    previousPatient.current = showNew ? form.patient_id : "";
    const filled = { ...autoFilled.current.visit, ...autoFilled.current.carry };
    autoFilled.current = { visit: {}, carry: {} };
    setCarryHint(null);
    setVisitHint(null);
    if (!before || before === form.patient_id) {
      // First pick (or a closed form): only drop automatic values, there is nothing else tied to a patient yet.
      const keys = Object.keys(filled);
      if (keys.length === 0) return;
      setFormExtra((prev) => {
        const next = { ...prev };
        for (const k of keys) if (JSON.stringify(prev[k]) === JSON.stringify(filled[k])) delete next[k];
        return next;
      });
      return;
    }
    const carryIds = new Set(
      formConfig.blocks.filter((b) => b.type === "custom" && b.carryForward).map((b) => b.id),
    );
    setFormExtra((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(prev)) {
        if (k.startsWith(SYS_PREFIX) || carryIds.has(k) || k in filled) delete next[k];
      }
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.patient_id, showNew]);

  // Fills only fields that are still empty, remembers what it filled and where from, and says whether it filled anything.
  const applyAutoFill = (add: Record<string, unknown>, source: "visit" | "carry"): boolean => {
    const current = formExtraRef.current;
    const fresh = Object.fromEntries(Object.entries(add).filter(([k]) => isEmptyValue(current[k])));
    if (Object.keys(fresh).length === 0) return false;
    Object.assign(autoFilled.current[source], fresh);
    setFormExtra((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(fresh)) if (isEmptyValue(prev[k])) next[k] = v;
      return next;
    });
    return true;
  };

  // Fields marked "carry forward" (histories, allergies) start from the patient's last prescription.
  const [carryHint, setCarryHint] = useState<string | null>(null);
  const carrySeq = useRef(0);
  useEffect(() => {
    const seq = ++carrySeq.current;
    const patientId = form.patient_id;
    if (!showNew || !profile || !patientId || !hasCarryForward(formConfig)) return;
    void (async () => {
      const { data } = await supabase
        .from("prescriptions")
        .select("extra, template_snapshot, date")
        .eq("doctor_id", profile.id)
        .eq("patient_id", patientId)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(5);
      if (seq !== carrySeq.current || !Array.isArray(data)) return;
      const source = data.find((r) =>
        Object.keys(carryForwardValues(formConfig, {}, parseTemplateConfig(r.template_snapshot), r.extra)).length > 0);
      if (!source) return;
      const prevConfig = parseTemplateConfig(source.template_snapshot);
      if (applyAutoFill(carryForwardValues(formConfig, formExtraRef.current, prevConfig, source.extra), "carry")) {
        setCarryHint(`Histories and allergies filled in from the prescription of ${source.date}. Check them before saving.`);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showNew, profile, form.patient_id, formConfig]);

  // Complaint, symptoms and vitals the template asks for start from the patient's visit on the prescription's date
  // (when the doctor or staff already recorded one), so they are not typed twice. Another date means another visit:
  // what was filled from the previous one (and not edited) is removed first.
  const [visitHint, setVisitHint] = useState<string | null>(null);
  const visitSeq = useRef(0);
  const wantsVisitData =
    showsComplaint(formConfig, "complaint") || showsComplaint(formConfig, "symptoms") || vitalFields(formConfig).length > 0;
  useEffect(() => {
    const seq = ++visitSeq.current;
    const stale = autoFilled.current.visit;
    autoFilled.current.visit = {};
    if (Object.keys(stale).length > 0) {
      setFormExtra((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(stale)) if (JSON.stringify(prev[k]) === JSON.stringify(stale[k])) delete next[k];
        return next;
      });
      setVisitHint(null);
    }
    const patientId = form.patient_id;
    if (!showNew || !profile || !patientId || !wantsVisitData) return;
    void (async () => {
      let q = supabase
        .from("patient_visits")
        .select("id, reason_for_visit, symptoms")
        .eq("patient_id", patientId)
        .eq("visit_date", form.date)
        .is("deleted_at", null);
      // In a multi-doctor clinic the visit must be this doctor's, not a colleague's on the same day.
      if (isMulti && formDoctor) q = q.eq("practitioner_id", formDoctor);
      const { data: visits } = await q.order("created_at", { ascending: false }).limit(1);
      const visit = Array.isArray(visits) ? (visits[0] as { id?: string; reason_for_visit?: unknown; symptoms?: unknown } | undefined) : undefined;
      if (seq !== visitSeq.current || !visit) return;
      const vitalKeys = vitalFields(formConfig);
      let vitals: Record<string, unknown> | undefined;
      if (visit.id && vitalKeys.length > 0) {
        const { data } = await supabase
          .from("patient_vitals")
          .select("blood_pressure, pulse, temperature, respiratory_rate, spo2, height, weight, bmi")
          .eq("visit_id", visit.id)
          .limit(1);
        vitals = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
      }
      if (seq !== visitSeq.current) return;
      const add: Record<string, unknown> = {};
      if (showsComplaint(formConfig, "complaint") && typeof visit.reason_for_visit === "string" && visit.reason_for_visit.trim()) add[SYS_COMPLAINT] = visit.reason_for_visit;
      if (showsComplaint(formConfig, "symptoms") && typeof visit.symptoms === "string" && visit.symptoms.trim()) add[SYS_SYMPTOMS] = visit.symptoms;
      for (const k of vitalKeys) {
        // A recorded value the form would refuse (SpO2 101, height 0) is not copied: the doctor never typed it.
        const v = cleanVital(k, vitals?.[k]);
        if (v !== undefined) add[sysVitalKey(k)] = String(v);
      }
      if (applyAutoFill(add, "visit")) setVisitHint(`Filled in from this patient's visit on ${form.date}. Check it before saving.`);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showNew, profile, form.patient_id, form.date, formConfig, wantsVisitData, formDoctor, isMulti]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkConfirmText, setBulkConfirmText] = useState("");

  const [slipOpen, setSlipOpen] = useState(false);
  const [slipPrescription, setSlipPrescription] = useState<PrescriptionSlipData | null>(null);
  const [slipPatientPhone, setSlipPatientPhone] = useState<string | null>(null);
  // Mounted off-screen (not in a dialog) just long enough to rasterize for a direct download.
  const [downloadingPrescription, setDownloadingPrescription] = useState<PrescriptionSlipData | null>(null);

  // A slower, older response (e.g. the page-3 request fired just before a filter reset the
  // pager to page 1) must never overwrite a newer one.
  const loadSeq = useRef(0);
  const load = async () => {
    if (!profile) return;
    const seq = ++loadSeq.current;
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    let q = supabase.from("prescriptions").select("*", { count: "exact" }).eq("doctor_id", profile.id);
    if (dateFilterActive) q = q.eq("date", format(selectedDate, "yyyy-MM-dd"));
    if (isMulti && doctorFilter !== ALL_DOCTORS) q = q.eq("practitioner_id", doctorFilter);
    const term = sanitizeSearchTerm(debouncedSearch);
    if (term) {
      const byDoctor = isMulti
        ? practitioners.filter((p) => p.display_name.toLowerCase().includes(term.toLowerCase())).map((p) => p.id)
        : [];
      q = q.or(
        `patient_name.ilike.%${term}%,diagnosis.ilike.%${term}%` + (byDoctor.length ? `,practitioner_id.in.(${byDoctor.join(",")})` : ""),
      );
    }
    // created_at/id break ties so rows with the same date cannot repeat or vanish between pages.
    q = q.order("date", { ascending: false }).order("created_at", { ascending: false }).order("id").range(from, to);
    const { data, count, error } = await q;
    if (seq !== loadSeq.current) return;
    if (error) { console.error("Prescriptions load failed:", error.message); return; }
    setPrescriptions((data || []) as Prescription[]);
    setTotalCount(count ?? 0);
  };

  // Reset to page 1 whenever the search term changes underneath the pager.
  useEffect(() => { setPage(1); }, [debouncedSearch, selectedDate, dateFilterActive, doctorFilter]);

  useEffect(() => { load(); }, [profile, debouncedSearch, selectedDate, dateFilterActive, page, isMulti, doctorFilter]);

  // A doctor login opens on their own prescriptions (they can still switch to "All doctors").
  const ownFilterApplied = useRef(false);
  useEffect(() => {
    if (ownFilterApplied.current || !isMulti || !isDoctorLogin || !myPractitionerId) return;
    ownFilterApplied.current = true;
    setDoctorFilter(myPractitionerId);
  }, [isMulti, isDoctorLogin, myPractitionerId]);

  // Prescriptions written, corrected or removed on another device show up here.
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!profile) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel(`rx-list-${profile.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "prescriptions", filter: `doctor_id=eq.${profile.id}` },
        () => { clearTimeout(timer); timer = setTimeout(() => loadRef.current(), 300); },
      )
      .subscribe();
    return () => { clearTimeout(timer); supabase.removeChannel(channel); };
  }, [profile]);
  useEffect(() => { clearSelection(); }, [debouncedSearch, dateFilterActive, selectedDate, page, doctorFilter]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    if (page > totalPages) setPage(totalPages);
  }, [totalCount, page]);

  // Shared by the full preview (View) and the direct PDF download (Download):
  // both need the same patient gender/phone + latest visit/vitals lookup.
  const buildSlipData = async (rx: Prescription): Promise<{ data: PrescriptionSlipData; phone: string | null }> => {
    let gender: string | null = null;
    let phone: string | null = null;
    if (rx.patient_id) {
      const { data } = await supabase.from("patients").select("gender, phone").eq("id", rx.patient_id).maybeSingle();
      gender = data?.gender ?? null;
      phone = data?.phone ?? null;
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
    return {
      phone,
      data: {
        id: rx.id,
        practitioner_id: rx.practitioner_id ?? null,
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
        extra: parseExtra(rx.extra),
        template_snapshot: rx.template_snapshot ?? null,
      },
    };
  };

  // "View" — the full printable/downloadable preview dialog (Print, Download, Share, Close).
  const openSlip = async (rx: Prescription) => {
    const { data, phone } = await buildSlipData(rx);
    setSlipPatientPhone(phone);
    setSlipPrescription(data);
    setSlipOpen(true);
  };

  const downloadPdf = (prescription: PrescriptionSlipData) => downloadPdfFromNode(
    '[data-prescription-slip-print-root] [data-prescription-slip-body]',
    pdfFileName("Prescription", prescription.patient_name, prescription.date),
    {
      multiPage: true,
      headerSelector: '[data-prescription-slip-print-root] [data-prescription-slip-header]',
      footerSelector: '[data-prescription-slip-print-root] [data-prescription-slip-footer]',
      rowSelector: '[data-prescription-slip-print-root] [data-prescription-slip-row]',
    }
  );

  const downloadSlip = () => {
    if (!slipPrescription) return;
    downloadPdf(slipPrescription);
  };

  // "Download" — builds the same slip data but renders it off-screen (no dialog) purely
  // to rasterize it for the PDF, exactly like the preview's own Download button does.
  const downloadPrescriptionDirect = async (rx: Prescription) => {
    const { data } = await buildSlipData(rx);
    setDownloadingPrescription(data);
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    try {
      await downloadPdf(data);
    } finally {
      setDownloadingPrescription(null);
    }
  };

  // "WhatsApp Share" — same create_prescription_share RPC + wa.me convention as
  // PrescriptionShare.tsx (used inside the full preview), reused here as a single action.
  const shareOnWhatsApp = async (rx: Prescription) => {
    let phone: string | null = null;
    if (rx.patient_id) {
      const { data } = await supabase.from("patients").select("phone").eq("id", rx.patient_id).maybeSingle();
      phone = data?.phone ?? null;
    }
    const tab = window.open("", "_blank");
    const { data, error } = await supabase.rpc("create_prescription_share" as any, { _prescription_id: rx.id });
    const token = (data as { token?: string } | null)?.token;
    if (error || !token) {
      tab?.close();
      toast.error(practitionerErrorMessage(error?.message ?? (data as { error?: string } | null)?.error) ?? "Could not create the share link");
      return;
    }
    const link = prescriptionShareUrl(window.location.origin, token);
    const doctorName = slipDoctor(profile, byId(rx.practitioner_id))?.full_name || "";
    const message = buildShareMessage({ patientName: rx.patient_name, doctorName, link });
    const url = buildWhatsAppUrl(phone, message);
    if (tab) tab.location.href = url; else window.location.href = url;
  };

  // Keep detail view in sync with latest data
  useEffect(() => {
    if (!viewing) return;
    const fresh = prescriptions.find((p) => p.id === viewing.id);
    if (fresh && fresh !== viewing) setViewing(fresh);
  }, [prescriptions]);

  // The doctor this patient was last seen by: most recent non-cancelled appointment, then the
  // most recent visit. Null when neither names a doctor.
  const lastPatientDoctor = async (patientId: string): Promise<string | null> => {
    if (!profile) return null;
    try {
      const { data: appts } = await supabase
        .from("appointments")
        .select("practitioner_id")
        .eq("doctor_id", profile.id)
        .eq("patient_id", patientId)
        .neq("status", "cancelled")
        .not("practitioner_id", "is", null)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);
      const fromAppt = (appts as { practitioner_id: string | null }[] | null)?.[0]?.practitioner_id;
      if (fromAppt) return fromAppt;
      const { data: visits } = await supabase
        .from("patient_visits")
        .select("practitioner_id")
        .eq("doctor_id", profile.id)
        .eq("patient_id", patientId)
        .is("deleted_at", null)
        .order("visit_date", { ascending: false })
        .limit(1);
      return (visits as { practitioner_id: string | null }[] | null)?.[0]?.practitioner_id ?? null;
    } catch {
      return null;
    }
  };

  const suggestDoctor = async (patientId: string, patientName?: string) => {
    const seq = ++suggestSeq.current;
    if (!needsDoctorPick || !patientId) { setRxDoctorHint(null); return; }
    doctorTouched.current = false;
    const found = await lastPatientDoctor(patientId);
    if (seq !== suggestSeq.current || doctorTouched.current) return;
    const doc = found ? byId(found) : undefined;
    if (doc?.is_active) {
      const name = patientName || "the patient";
      setRxDoctor(doc.id);
      setRxDoctorHint(`Defaulted from ${name}'s last visit`);
    } else {
      setRxDoctor(myPractitionerId);
      setRxDoctorHint(null);
    }
  };

  const chooseNewDoctor = (id: string) => { doctorTouched.current = true; setRxDoctor(id); setRxDoctorHint(null); };

  const addPrescription = async () => {
    if (!profile || !form.patient_name.trim()) { toast.error("Patient name is required"); return; }
    const vitalsError = prescriptionVitalsError(form);
    if (vitalsError) { toast.error(vitalsError); return; }
    const medError = blockEnabled(formConfig, "medicines") ? validateMedicines(formMedicines) : null;
    if (medError) { toast.error(medError); return; }
    const extraError = validateExtra(formConfig, formExtra);
    if (extraError) { toast.error(extraError); return; }
    if (needsDoctorPick && !rxDoctor) { toast.error(practitionerErrorMessage("PRACTITIONER_REQUIRED")); return; }
    const extra = cleanExtra(formConfig, formExtra);
    const { data, error } = await supabase.from("prescriptions").insert({
      doctor_id: profile.id,
      patient_id: form.patient_id || null,
      patient_name: form.patient_name.trim(),
      diagnosis: showsDiagnosis(formConfig) ? form.diagnosis || null : null,
      medicines: blockEnabled(formConfig, "medicines") ? toMedicineItems(formMedicines) : [],
      date: form.date,
      patient_age: form.patient_age ? Number(form.patient_age) : null,
      patient_weight: parseWeight(form.patient_weight),
      ...templateColumns(formConfig, form, "insert"),
      // Only sent when used, so a clinic without templates writes exactly what it always did.
      ...(Object.keys(extra).length > 0 ? { extra } : {}),
      ...(formTemplate ? { template_id: formTemplate.id, template_snapshot: formTemplate.config } : {}),
      ...(needsDoctorPick && rxDoctor ? { practitioner_id: rxDoctor } : {}),
    }).select().single();
    if (error) { toast.error(practitionerErrorMessage(error.message) ?? "Could not add prescription"); return; }
    setShowNew(false);
    setForm(emptyForm);
    setFormMedicines([]);
    setFormExtra({});
    templateTouched.current = false;
    setFormTemplateId(null);
    setRxDoctor(null);
    setRxDoctorHint(null);
    load();
    toast.success("Prescription added");
    if (data) openSlip(data as Prescription);
  };

  const saveEdit = async () => {
    if (!viewing) return;
    if (!editForm.patient_name.trim()) { toast.error("Patient name is required"); return; }
    const editVitalsError = prescriptionVitalsError(editForm);
    if (editVitalsError) { toast.error(editVitalsError); return; }
    const medError = blockEnabled(editConfig, "medicines") ? validateMedicines(editFormMedicines) : null;
    if (medError) { toast.error(medError); return; }
    const extraError = validateExtra(editConfig, editExtra);
    if (extraError) { toast.error(extraError); return; }
    const doctorChanged = ownerEditsDoctor && !!editDoctor && editDoctor !== viewing.practitioner_id;
    const extra = cleanExtra(editConfig, editExtra);
    // Answers only change when the layout has custom fields (or the row already holds some).
    const touchesExtra = Object.keys(extra).length > 0 || Object.keys(parseExtra(viewing.extra)).length > 0;
    const { error } = await supabase.from("prescriptions").update({
      ...(doctorChanged ? { practitioner_id: editDoctor } : {}),
      patient_id: editForm.patient_id || null,
      patient_name: editForm.patient_name.trim(),
      // A section the layout has switched off is left as it was, never overwritten.
      ...(showsDiagnosis(editConfig) ? { diagnosis: editForm.diagnosis || null } : {}),
      ...(blockEnabled(editConfig, "medicines") ? { medicines: toMedicineItems(editFormMedicines) } : {}),
      date: editForm.date,
      patient_age: editForm.patient_age ? Number(editForm.patient_age) : null,
      patient_weight: parseWeight(editForm.patient_weight),
      ...templateColumns(editConfig, editForm, "update", viewing as unknown as Record<string, unknown>),
      ...(touchesExtra ? { extra } : {}),
    }).eq("id", viewing.id);
    if (error) { toast.error(practitionerErrorMessage(error.message) ?? "Could not save changes"); return; }
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
      advice: viewing.advice ?? "",
      diet_advice: viewing.diet_advice ?? "",
      lifestyle_advice: viewing.lifestyle_advice ?? "",
      follow_up_date: viewing.follow_up_date ?? "",
      follow_up_instructions: viewing.follow_up_instructions ?? "",
    });
    setEditExtra(parseExtra(viewing.extra));
    setEditFormMedicines(fromMedicineItems(parseMedicineItems(viewing.medicines)));
    setEditDoctor(viewing.practitioner_id ?? null);
    setEditing(true);
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());
  const bulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    if (writeDisabled) { toast.error("Upgrade to continue editing"); return; }
    const { error } = await supabase.from("prescriptions").delete().in("id", ids);
    if (error) { toast.error("Could not delete prescriptions"); return; }
    toast.success(`${ids.length} prescription${ids.length === 1 ? "" : "s"} deleted`);
    setBulkDeleteOpen(false);
    setBulkConfirmText("");
    clearSelection();
    load();
  };

  // Search now happens server-side in load(), so the current page's rows
  // are already the filtered/paginated result set.
  const filtered = prescriptions;
  const allOnPageSelected = filtered.length > 0 && selectedIds.size === filtered.length;
  // The slip and its share name the prescription's author doctor (clinic details stay the clinic's).
  const slipProfile = slipDoctor(profile, byId(slipPrescription?.practitioner_id));
  const authorBadge = (rx: Prescription) => {
    const author = isMulti ? byId(rx.practitioner_id) : undefined;
    return author ? (
      <Badge variant="secondary" className="mt-1 text-[10px] font-medium">{drName(author.display_name)}</Badge>
    ) : null;
  };
  const selectAllOnPage = () => {
    if (allOnPageSelected) clearSelection();
    else setSelectedIds(new Set(filtered.map((p) => p.id)));
  };

  return (
    <div
      className={`max-w-6xl mx-auto space-y-5 transition-[padding] duration-150 ${
        selectedIds.size > 0 ? "pb-[calc(10rem+env(safe-area-inset-bottom))] sm:pb-0" : ""
      }`}
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-bold text-2xl text-primary flex items-center gap-2">
            <FileText className="h-6 w-6 text-ai-purple" /> Prescriptions
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{totalCount} total records</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        {canManageTemplates && (
          <Button variant="outline" onClick={() => setTemplatesOpen(true)}>
            <LayoutTemplate className="h-4 w-4 mr-1" /> Templates
          </Button>
        )}
        {can("prescriptions.create") && (
        <Dialog open={showNew} onOpenChange={(o) => { setShowNew(o); templateTouched.current = false; setFormExtra({}); if (o) { suggestSeq.current++; doctorTouched.current = false; setRxDoctor(myPractitionerId); setRxDoctorHint(null); } else { setForm(emptyForm); setFormMedicines([]); setFormTemplateId(null); setRxDoctor(null); setRxDoctorHint(null); } }}>
          <DialogTrigger asChild>
            <Button
              className="bg-royal hover:bg-royal/90"
              disabled={writeDisabled}
              title={writeDisabled ? "Upgrade to continue editing" : undefined}
            >
              <Plus className="h-4 w-4 mr-1" /> New Prescription
            </Button>
          </DialogTrigger>
          <DialogContent className={`${formConfig.blocks.some((b) => b.type === "custom" && b.enabled) ? "sm:max-w-2xl" : "sm:max-w-lg"} max-h-[90vh] overflow-y-auto`}>
            <DialogHeader><DialogTitle>Add Prescription</DialogTitle></DialogHeader>
            <div className="space-y-4">
              {needsDoctorPick && (
                <div className="space-y-1.5">
                  <Label htmlFor="new-rx-doctor">Prescribing doctor *</Label>
                  <PractitionerSelect id="new-rx-doctor" aria-label="Prescribing doctor" required value={rxDoctor} onChange={chooseNewDoctor} />
                  {rxDoctorHint && <p className="text-xs text-muted-foreground">{rxDoctorHint}</p>}
                </div>
              )}
              {pickerTemplates.length > 0 && (
                <div className="space-y-1.5">
                  <Label htmlFor="new-rx-template">Template</Label>
                  <Select
                    value={formTemplate?.id ?? STANDARD_TEMPLATE}
                    onValueChange={(v) => { templateTouched.current = true; setFormTemplateId(v === STANDARD_TEMPLATE ? null : v); }}
                  >
                    <SelectTrigger id="new-rx-template" aria-label="Template" className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={STANDARD_TEMPLATE}>Standard</SelectItem>
                      {pickerTemplates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {formTemplate
                      ? `Using "${formTemplate.name}". Its extra fields are below.`
                      : "Using the standard layout. Choose a template here to get its extra fields."}
                  </p>
                </div>
              )}
              <PrescriptionPatientFields
                idPrefix="new-rx"
                selectLabel="Select Existing Patient"
                clinicId={profile?.id ?? ""}
                practitionerId={needsDoctorPick ? rxDoctor : myPractitionerId}
                value={form}
                onChange={(patch) => {
                  setForm((prev) => ({ ...prev, ...patch }));
                  if ("patient_id" in patch) void suggestDoctor(patch.patient_id ?? "", patch.patient_name);
                }}
              />

              {[visitHint, carryHint].filter(Boolean).map((hint) => (
                <p key={hint} className="text-xs text-muted-foreground rounded-md bg-secondary/60 px-3 py-2">{hint}</p>
              ))}
              <TemplateFormFields
                config={formConfig}
                idPrefix="new-rx"
                values={form}
                onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
                extra={formExtra}
                onExtraChange={(id, v) => setFormExtra((prev) => ({ ...prev, [id]: v }))}
                renderMedicines={() => <MedicinesEditor items={formMedicines} onChange={setFormMedicines} />}
              />
              <Button onClick={addPrescription} disabled={writeDisabled} className="w-full h-10 bg-royal hover:bg-royal/90">Save Prescription</Button>
            </div>
          </DialogContent>
        </Dialog>
        )}
        </div>
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

      {isMulti ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9 h-10" placeholder="Search by patient or diagnosis..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <PractitionerSelect allowAll value={doctorFilter} onChange={setDoctorFilter} aria-label="Filter by doctor" className="sm:w-56" />
        </div>
      ) : (
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9 h-10" placeholder="Search by patient or diagnosis..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      )}

      {filtered.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {selectedIds.size > 0 ? (
              <span>{selectedIds.size} of {filtered.length} selected on this page</span>
            ) : (
              <span>{filtered.length} prescription{filtered.length === 1 ? "" : "s"} on this page</span>
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
                    {!isStaff && (
                      <th className="pl-4 pr-2 py-3 w-10">
                        <Checkbox
                          checked={selectedIds.size === 0 ? false : allOnPageSelected ? true : "indeterminate"}
                          onCheckedChange={selectAllOnPage}
                          aria-label="Select all prescriptions on this page"
                          className="h-5 w-5 rounded"
                        />
                      </th>
                    )}
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
                        className={`border-b border-border/60 last:border-0 transition-colors ${
                          isSelected ? "bg-royal/5" : ""
                        }`}
                      >
                        {!isStaff && (
                          <td className="pl-4 pr-2 py-3 w-10">
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
                              <NameButton onClick={() => setViewing(rx)} className="font-semibold text-foreground truncate block">
                                {rx.patient_name}
                              </NameButton>
                              <div className="text-xs text-muted-foreground md:hidden truncate">
                                {rx.diagnosis || "—"}
                              </div>
                              {authorBadge(rx)}
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
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{rx.date}</td>
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
                  className={`border-border/60 shadow-none transition-colors ${isSelected ? "bg-royal/5 border-royal/30" : ""}`}
                >
                  <CardContent className="p-4 flex items-start gap-3">
                    {!isStaff && (
                      <div className="pt-1">
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
                        <NameButton onClick={() => setViewing(rx)} className="font-semibold text-foreground truncate block">
                          {rx.patient_name}
                        </NameButton>
                        <span className="text-xs text-muted-foreground flex-shrink-0">{rx.date}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                        <Stethoscope className="h-3.5 w-3.5 text-royal flex-shrink-0" />
                        <span className="truncate">{rx.diagnosis || "—"}</span>
                      </div>
                      <div className="flex items-start gap-1.5 text-xs text-muted-foreground mt-1">
                        <Pill className="h-3.5 w-3.5 text-teal flex-shrink-0 mt-0.5" />
                        <MedicineSummaryLine rx={rx} />
                      </div>
                      {authorBadge(rx)}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <PaginationBar page={page} totalCount={totalCount} onPageChange={setPage} />
        </>
      )}

      {/* Prescription detail sheet */}
      <Sheet open={!!viewing} onOpenChange={(o) => { if (!o) { setViewing(null); setEditing(false); } }}>
        <SheetContent className="w-full sm:max-w-lg md:max-w-[35rem] overflow-y-auto">
          {viewing && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-ai-purple/10 flex items-center justify-center text-base font-bold text-ai-purple flex-shrink-0">
                    {viewing.patient_name?.charAt(0)?.toUpperCase() || "P"}
                  </div>
                  <div className="min-w-0">
                    <SheetTitle className="text-primary text-lg truncate">{viewing.patient_name}</SheetTitle>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Issued {viewing.date}
                      {isMulti && byId(viewing.practitioner_id) ? ` · ${drName(byId(viewing.practitioner_id)!.display_name)}` : ""}
                    </div>
                  </div>
                </div>
              </SheetHeader>

              {!editing ? (
                <div className="mt-6 space-y-5">
                  <div>
                    <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><Stethoscope className="h-3.5 w-3.5" /> Diagnosis</Label>
                    <p className="text-sm text-foreground mt-1">{viewing.diagnosis || <span className="text-muted-foreground italic">Not specified</span>}</p>
                  </div>
                  <TemplateAnswersView config={editConfig} extra={viewing.extra} />
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
                  <div className="pt-2 grid grid-cols-2 md:flex md:flex-wrap gap-2 md:gap-1.5">
                    <Button variant="outline" className="h-10 w-full md:w-auto px-2 md:px-3 whitespace-nowrap" onClick={() => openSlip(viewing)}>
                      <Eye className="h-4 w-4 mr-1.5 flex-shrink-0" /> View
                    </Button>
                    {can("prescriptions.edit") && canChangeRx(viewing) && (
                      <Button variant="outline" className="h-10 w-full md:w-auto px-2 md:px-3 whitespace-nowrap" onClick={startEdit}>
                        <Pencil className="h-4 w-4 mr-1.5 flex-shrink-0" /> Edit
                      </Button>
                    )}
                    <Button variant="outline" className="h-10 w-full md:w-auto px-2 md:px-3 whitespace-nowrap" onClick={() => downloadPrescriptionDirect(viewing)}>
                      <Download className="h-4 w-4 mr-1.5 flex-shrink-0" /> Download
                    </Button>
                    <Button variant="outline" className="h-10 w-full md:w-auto px-2 md:px-3 whitespace-nowrap text-[#1ebe5b] border-[#25D366]/40 hover:bg-[#25D366]/10 hover:text-[#1ebe5b]" onClick={() => shareOnWhatsApp(viewing)}>
                      <MessageCircle className="h-4 w-4 mr-1.5 flex-shrink-0" /> WhatsApp
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-6 space-y-4">
                  {ownerEditsDoctor && (
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-rx-doctor">Prescribing doctor</Label>
                      <PractitionerSelect
                        id="edit-rx-doctor" aria-label="Prescribing doctor" required
                        value={editDoctor} onChange={setEditDoctor} includeIds={viewing.practitioner_id ? [viewing.practitioner_id] : undefined}
                      />
                    </div>
                  )}
                  <PrescriptionPatientFields
                    idPrefix="edit-rx"
                    selectLabel="Linked Patient"
                    clinicId={profile?.id ?? ""}
                    practitionerId={ownerEditsDoctor ? editDoctor : viewing.practitioner_id}
                    value={editForm}
                    onChange={(patch) => setEditForm((prev) => ({ ...prev, ...patch }))}
                  />

                  <TemplateFormFields
                    config={editConfig}
                    idPrefix="edit-rx"
                    values={editForm}
                    onChange={(patch) => setEditForm((prev) => ({ ...prev, ...patch }))}
                    extra={editExtra}
                    onExtraChange={(id, v) => setEditExtra((prev) => ({ ...prev, [id]: v }))}
                    renderMedicines={() => <MedicinesEditor items={editFormMedicines} onChange={setEditFormMedicines} />}
                  />
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
      <BulkSelectionBar
        itemLabel="prescription"
        selectedCount={selectedIds.size}
        allOnPageSelected={allOnPageSelected}
        onSelectAll={selectAllOnPage}
        onClear={clearSelection}
        onDeleteClick={() => { setBulkConfirmText(""); setBulkDeleteOpen(true); }}
      />

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
        profile={slipProfile}
        prescription={slipPrescription}
        onDownload={downloadSlip}
        hideShare
        shareSlot={
          slipPrescription?.id && can("prescriptions.view") ? (
            <PrescriptionShare
              key={slipPrescription.id}
              prescriptionId={slipPrescription.id}
              patientName={slipPrescription.patient_name}
              patientPhone={slipPatientPhone}
              doctorName={slipProfile?.full_name || ""}
            />
          ) : undefined
        }
      />

      {canManageTemplates && profile && (
        <PrescriptionTemplatesDialog
          open={templatesOpen}
          onOpenChange={setTemplatesOpen}
          api={templatesApi}
          profile={slipDoctor(profile, byId(myPractitionerId))}
          isOwner={!isStaff}
          myPractitionerId={myPractitionerId}
        />
      )}

      {/* Off-screen, used only to rasterize a direct "Download" (no visible dialog). */}
      {downloadingPrescription && (
        <div style={{ position: "fixed", left: "-9999px", top: 0, pointerEvents: "none" }} aria-hidden="true">
          <div data-prescription-slip-print-root>
            <PrescriptionSlipCard profile={slipDoctor(profile, byId(downloadingPrescription.practitioner_id))} prescription={downloadingPrescription} />
          </div>
        </div>
      )}
    </div>
  );
};

export default PrescriptionsPage;
