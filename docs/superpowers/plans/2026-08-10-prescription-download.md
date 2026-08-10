# Downloadable Prescription Slip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a doctor download any prescription as a PDF styled like the provided template (blue letterhead, patient info row, Rx body, signature, clinic footer), matching this app's existing appointment/payment-slip download pattern.

**Architecture:** A new `PrescriptionSlip.tsx` component (styled HTML card in a `Dialog`, modeled directly on `AppointmentSlip.tsx`) renders the template from live data. Downloading reuses `html2canvas` + `jsPDF` via a `downloadPdfFromNode` helper extracted from `BookingWidget.tsx` into a shared `src/lib/` utility — one canonical implementation instead of a second copy. Two new nullable columns on `prescriptions` (`patient_age`, `patient_weight`) back the template's Age/Weight fields; Gender is resolved from the linked `patients` row at view/download time, not stored redundantly.

**Tech Stack:** React + TypeScript, Supabase (Postgres + supabase-js), html2canvas + jsPDF (already dependencies), Vitest + Testing Library.

## Global Constraints

- Output format is PDF via `html2canvas` + `jsPDF` — not a raw PNG/JPG file.
- Download is on-demand only (a button) — never an automatic download on save.
- The generated document omits the `notes` field entirely, matching the reference template exactly — `notes` stays in the app's own detail view only.
- No Doctylia branding on the slip — this is the doctor's own clinic letterhead.
- Colors use the app's existing design tokens (`bg-royal`, `bg-secondary`, `text-muted-foreground`, etc.) — no new hardcoded hex constants.
- `BookingWidget.tsx`'s behavior must not change — the `downloadPdfFromNode` extraction is a pure refactor.

---

### Task 1: `prescriptions` migration — `patient_age`, `patient_weight`

**Files:**
- Create: `supabase/migrations/20260810020000_prescription_age_weight.sql`
- Modify: `src/integrations/supabase/types.ts` (the `prescriptions` table block)

**Interfaces:**
- Produces: `prescriptions.patient_age integer NULL`, `prescriptions.patient_weight numeric NULL`.

- [ ] **Step 1: Write and apply the migration**

```sql
ALTER TABLE public.prescriptions ADD COLUMN patient_age integer;
ALTER TABLE public.prescriptions ADD COLUMN patient_weight numeric;
```

Apply via the `mcp__supabase__apply_migration` tool (`project_id: "atmelijhxsjzjixhdfcu"`, `name: "prescription_age_weight"`), then save the same SQL as the tracked file above (this project's established pattern — apply live, then commit the file).

- [ ] **Step 2: Verify the columns exist**

Run via `mcp__supabase__execute_sql`:
```sql
SELECT column_name, is_nullable, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name='prescriptions' AND column_name IN ('patient_age', 'patient_weight');
```
Expected: two rows, both `is_nullable = 'YES'`.

- [ ] **Step 3: Update `types.ts` by hand**

In `src/integrations/supabase/types.ts`, find the `prescriptions` table block and add `patient_age: number | null` / `patient_weight: number | null` to `Row`, and `patient_age?: number | null` / `patient_weight?: number | null` to `Insert` and `Update` (alongside the existing `patient_id`, `patient_name`, etc. fields already there).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260810020000_prescription_age_weight.sql src/integrations/supabase/types.ts
git commit -m "feat: add patient_age and patient_weight columns to prescriptions"
```

---

### Task 2: Extract `downloadPdfFromNode` into a shared utility

**Files:**
- Create: `src/lib/downloadPdfFromNode.ts`
- Modify: `src/components/doctor/BookingWidget.tsx:1-3` (imports), `:265-289` (remove local definition, update call sites)

**Interfaces:**
- Produces: `export async function downloadPdfFromNode(selector: string, filename: string): Promise<void>`
- Consumes (by `BookingWidget.tsx`): same signature, called at the same two call sites (`downloadSlip`, `downloadPaymentSlip`).

- [ ] **Step 1: Create the shared utility**

```typescript
// src/lib/downloadPdfFromNode.ts
import jsPDF from "jspdf";

// Rasterizes the DOM node matched by `selector` and embeds it as a single
// image filling one A4 page — used by every "download this styled card as a
// PDF" feature (appointment slips, payment receipts, prescription slips) so
// there is exactly one implementation of this pattern, not one per feature.
export async function downloadPdfFromNode(selector: string, filename: string): Promise<void> {
  const html2canvas = (await import("html2canvas")).default;
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) return;
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
  const imgData = canvas.toDataURL("image/png");
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 24;
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;
  const ratio = canvas.width / canvas.height;
  let w = maxW;
  let h = w / ratio;
  if (h > maxH) { h = maxH; w = h * ratio; }
  const x = (pageW - w) / 2;
  const y = (pageH - h) / 2;
  doc.addImage(imgData, "PNG", x, y, w, h);
  doc.save(filename);
}
```

- [ ] **Step 2: Update `BookingWidget.tsx` to use it**

Remove the `jsPDF` import (no longer used directly in this file) and add the new import:

```tsx
import { CheckCircle2, XCircle, ChevronLeft, Video, Users, Clock, FileText, Building2, Receipt } from "lucide-react";
```
(remove the `import jsPDF from "jspdf";` line entirely, and add below the existing imports:)
```tsx
import { downloadPdfFromNode } from "@/lib/downloadPdfFromNode";
```

Remove the local function definition (the `downloadPdfFromNode` arrow function, lines 265-286) entirely — the two call sites (`downloadSlip`, `downloadPaymentSlip`) keep working unchanged since the imported function has the identical signature:

```tsx
  const downloadSlip = () => downloadPdfFromNode('[data-slip-print-root] .slip-card', `appointment-${token}.pdf`);
  const downloadPaymentSlip = () => downloadPdfFromNode('[data-payment-slip-print-root] .slip-card', `payment-receipt-${token}.pdf`);
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 4: Manual verification — booking flow still downloads correctly**

Using the `mcp__supabase__execute_sql` tool find any real doctor's slug, start the dev server, complete a test booking through `BookingWidget.tsx`, and click "Download Appointment Slip" on the confirmation screen — confirm the PDF still downloads exactly as before (this is a pure refactor; behavior must be identical).

- [ ] **Step 5: Commit**

```bash
git add src/lib/downloadPdfFromNode.ts src/components/doctor/BookingWidget.tsx
git commit -m "refactor: extract downloadPdfFromNode into a shared lib utility"
```

---

### Task 3: `PrescriptionSlip.tsx` component

**Files:**
- Create: `src/components/admin/PrescriptionSlip.tsx`
- Test: `src/components/admin/PrescriptionSlip.test.tsx`

**Interfaces:**
- Consumes: nothing beyond its own props — a pure presentational component.
- Produces:
  ```ts
  type PrescriptionSlipData = {
    id: string; patient_name: string; diagnosis: string | null; medications: string | null;
    date: string; patient_age: number | null; patient_weight: number | null; patient_gender: string | null;
  };
  export default function PrescriptionSlip(props: {
    open: boolean; onClose: () => void; profile: any;
    prescription: PrescriptionSlipData | null; onDownload: () => void;
  }): JSX.Element | null
  ```
  The rendered card's printable root has `data-prescription-slip-print-root`, containing `.slip-card` — this exact selector (`'[data-prescription-slip-print-root] .slip-card'`) is what Task 4 passes to `downloadPdfFromNode`.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/admin/PrescriptionSlip.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PrescriptionSlip from "./PrescriptionSlip";

const profile = {
  full_name: "Test Doctor", specialization: "Dermatologist", qualifications: "MBBS, MD",
  clinic_name: "Test Clinic", address: "123 Main St", city: "Testville", phone: "9999999999",
};

const prescription = {
  id: "rx-1", patient_name: "John Doe", diagnosis: "Acute bronchitis",
  medications: "Amoxicillin 500mg\nTwice daily for 5 days", date: "2026-08-10",
  patient_age: 34, patient_weight: 70, patient_gender: "male",
};

describe("PrescriptionSlip", () => {
  it("renders doctor, patient info, diagnosis and medications", () => {
    render(<PrescriptionSlip open onClose={() => {}} profile={profile} prescription={prescription} onDownload={() => {}} />);
    expect(screen.getByText(/Dr\. Test Doctor/)).toBeInTheDocument();
    expect(screen.getByText("MBBS, MD")).toBeInTheDocument();
    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText("34")).toBeInTheDocument();
    expect(screen.getByText("male")).toBeInTheDocument();
    expect(screen.getByText("70 kg")).toBeInTheDocument();
    expect(screen.getByText("Acute bronchitis")).toBeInTheDocument();
    expect(screen.getByText(/Amoxicillin 500mg/)).toBeInTheDocument();
    expect(screen.getByText("Test Clinic")).toBeInTheDocument();
    expect(screen.queryByText(/notes/i)).not.toBeInTheDocument();
  });

  it("falls back to — for missing age/weight/gender/diagnosis", () => {
    const incomplete = { ...prescription, patient_age: null, patient_weight: null, patient_gender: null, diagnosis: null };
    render(<PrescriptionSlip open onClose={() => {}} profile={profile} prescription={incomplete} onDownload={() => {}} />);
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(4);
  });

  it("renders nothing when prescription is null", () => {
    const { container } = render(<PrescriptionSlip open onClose={() => {}} profile={profile} prescription={null} onDownload={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/admin/PrescriptionSlip.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/admin/PrescriptionSlip.tsx
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Activity, Download, Printer, X } from "lucide-react";

type PrescriptionSlipData = {
  id: string;
  patient_name: string;
  diagnosis: string | null;
  medications: string | null;
  date: string;
  patient_age: number | null;
  patient_weight: number | null;
  patient_gender: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  profile: any;
  prescription: PrescriptionSlipData | null;
  onDownload: () => void;
};

const PrescriptionSlip = ({ open, onClose, profile, prescription, onDownload }: Props) => {
  if (!prescription) return null;

  const clinicName = profile?.clinic_name || (profile?.full_name ? `Dr. ${profile.full_name} Clinic` : "Clinic");
  const clinicAddr = profile?.address || profile?.city || "";
  const clinicPhone = profile?.phone || "";

  const handlePrint = () => {
    document.body.classList.add("printing-prescription-slip");
    const cleanup = () => {
      document.body.classList.remove("printing-prescription-slip");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    setTimeout(() => window.print(), 100);
  };

  const infoFields: Array<{ label: string; value: string }> = [
    { label: "Patient Name", value: prescription.patient_name },
    { label: "Date", value: prescription.date },
    { label: "Age", value: prescription.patient_age != null ? String(prescription.patient_age) : "—" },
    { label: "Gender", value: prescription.patient_gender || "—" },
    { label: "Weight", value: prescription.patient_weight != null ? `${prescription.patient_weight} kg` : "—" },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[700px] p-0 gap-0 max-h-[95vh] overflow-y-auto print:max-h-none print:overflow-visible print:shadow-none print:border-0 bg-white">
        <style>{`
          @media print {
            @page { size: A4 portrait; margin: 10mm; }
            body.printing-prescription-slip > *:not([data-prescription-slip-print-root]) { display: none !important; }
            body.printing-prescription-slip [data-prescription-slip-print-root] { display: block !important; position: static !important; }
            [data-prescription-slip-print-hide] { display: none !important; }
            [data-prescription-slip-print-root] .slip-card { box-shadow: none !important; border: none !important; }
          }
        `}</style>

        <div data-prescription-slip-print-root>
          <div className="slip-card bg-white overflow-hidden border">
            <div className="bg-royal text-white px-6 py-5 flex items-center justify-between">
              <div>
                <h2 className="font-heading font-bold text-2xl">
                  Dr. {profile?.full_name || ""}{" "}
                  {profile?.specialization && <span className="font-normal opacity-90">{profile.specialization}</span>}
                </h2>
                {profile?.qualifications && (
                  <p className="text-xs tracking-[0.2em] uppercase mt-1 opacity-90">{profile.qualifications}</p>
                )}
              </div>
              <div className="w-12 h-12 rounded-full border-2 border-white/70 flex items-center justify-center flex-shrink-0">
                <Activity className="h-6 w-6" />
              </div>
            </div>

            <div className="bg-secondary px-6 py-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              {infoFields.map((f) => (
                <div key={f.label} className="flex gap-1.5">
                  <span className="text-muted-foreground">{f.label}:</span>
                  <span className="font-medium text-foreground">{f.value}</span>
                </div>
              ))}
              <div className="col-span-2 flex gap-1.5">
                <span className="text-muted-foreground">Diagnosis:</span>
                <span className="font-medium text-foreground">{prescription.diagnosis || "—"}</span>
              </div>
            </div>

            <div className="px-6 py-8 min-h-[280px]">
              <div className="font-heading font-bold text-3xl text-royal mb-6">
                R<span className="align-sub text-xl">x</span>
              </div>
              <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">
                {prescription.medications || <span className="text-muted-foreground italic">No medications recorded</span>}
              </p>
            </div>

            <div className="px-6 pb-6 flex justify-end">
              <div className="text-center">
                <div className="w-40 border-t border-foreground/40 pt-1">
                  <span className="text-xs text-muted-foreground">Signature</span>
                </div>
              </div>
            </div>

            <div className="bg-secondary px-6 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground border-t">
              <span className="font-semibold tracking-wide uppercase text-foreground">{clinicName}</span>
              {clinicAddr && <span>{clinicAddr}</span>}
              {clinicPhone && <span>{clinicPhone}</span>}
            </div>
          </div>

          <div data-prescription-slip-print-hide className="flex flex-wrap gap-2 justify-end p-4 border-t bg-secondary/40">
            <Button variant="outline" onClick={handlePrint} className="gap-1.5">
              <Printer className="h-4 w-4" /> Print
            </Button>
            <Button variant="outline" onClick={onDownload} className="gap-1.5">
              <Download className="h-4 w-4" /> Download PDF
            </Button>
            <Button onClick={onClose} className="gap-1.5 bg-royal hover:bg-royal/90 text-white">
              <X className="h-4 w-4" /> Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PrescriptionSlip;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/admin/PrescriptionSlip.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/PrescriptionSlip.tsx src/components/admin/PrescriptionSlip.test.tsx
git commit -m "feat: add PrescriptionSlip component matching the reference letterhead template"
```

---

### Task 4: Wire Age/Weight fields and the Download flow into `PrescriptionsPage.tsx`

**Files:**
- Modify: `src/components/admin/PrescriptionsPage.tsx` (imports, `Prescription` type, `emptyForm`, `addPrescription`, `startEdit`, `saveEdit`, New/Edit form JSX, detail Sheet action row, new bottom-of-component `PrescriptionSlip` render)

**Interfaces:**
- Consumes: `PrescriptionSlip` (Task 3), `downloadPdfFromNode` (Task 2).
- Produces: no exported interface change — `PrescriptionsPage` remains the default export used by the router.

- [ ] **Step 1: Update imports and the `Prescription` type**

Replace:
```tsx
import { FileText, Plus, Search, Calendar, Pill, Stethoscope, User, Trash2, CheckSquare, X, Pencil } from "lucide-react";
```
with:
```tsx
import { FileText, Plus, Search, Calendar, Pill, Stethoscope, User, Trash2, CheckSquare, X, Pencil, Download } from "lucide-react";
```
Add after the existing imports:
```tsx
import PrescriptionSlip from "./PrescriptionSlip";
import { downloadPdfFromNode } from "@/lib/downloadPdfFromNode";
```
Replace the `Prescription` type:
```tsx
type Prescription = {
  id: string; doctor_id: string; patient_id: string | null; patient_name: string;
  diagnosis: string | null; medications: string | null; notes: string | null;
  date: string; created_at: string;
};
```
with:
```tsx
type Prescription = {
  id: string; doctor_id: string; patient_id: string | null; patient_name: string;
  diagnosis: string | null; medications: string | null; notes: string | null;
  date: string; created_at: string; patient_age: number | null; patient_weight: number | null;
};
```

- [ ] **Step 2: Extend `emptyForm` and add slip state**

Replace:
```tsx
const emptyForm = {
  patient_name: "", patient_id: "", diagnosis: "", medications: "", notes: "",
  date: format(new Date(), "yyyy-MM-dd"),
};
```
with:
```tsx
const emptyForm = {
  patient_name: "", patient_id: "", diagnosis: "", medications: "", notes: "",
  date: format(new Date(), "yyyy-MM-dd"), patient_age: "", patient_weight: "",
};
```
Inside the `PrescriptionsPage` component, alongside the existing `viewing`/`editing` state, add:
```tsx
  const [slipOpen, setSlipOpen] = useState(false);
  const [slipPrescription, setSlipPrescription] = useState<(Prescription & { patient_gender: string | null }) | null>(null);
```

- [ ] **Step 3: Add `openSlip` and `downloadSlip`**

Add this after `loadPatients` (or anywhere alongside the other action functions):
```tsx
  const openSlip = async (rx: Prescription) => {
    let gender: string | null = null;
    if (rx.patient_id) {
      const { data } = await supabase.from("patients").select("gender").eq("id", rx.patient_id).maybeSingle();
      gender = data?.gender ?? null;
    }
    setSlipPrescription({ ...rx, patient_gender: gender });
    setSlipOpen(true);
  };

  const downloadSlip = () => {
    if (!slipPrescription) return;
    downloadPdfFromNode('[data-prescription-slip-print-root] .slip-card', `prescription-${slipPrescription.id}.pdf`);
  };
```

- [ ] **Step 4: Update `addPrescription` to save Age/Weight and open the slip on success**

Replace:
```tsx
  const addPrescription = async () => {
    if (!profile || !form.patient_name) { toast.error("Patient name is required"); return; }
    await supabase.from("prescriptions").insert({
      doctor_id: profile.id,
      patient_id: form.patient_id || null,
      patient_name: form.patient_name,
      diagnosis: form.diagnosis || null,
      medications: form.medications || null,
      notes: form.notes || null,
      date: form.date,
    });
    setShowNew(false);
    setForm(emptyForm);
    load();
    toast.success("Prescription added");
  };
```
with:
```tsx
  const addPrescription = async () => {
    if (!profile || !form.patient_name) { toast.error("Patient name is required"); return; }
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
```

- [ ] **Step 5: Update `startEdit` and `saveEdit` to carry Age/Weight**

Replace:
```tsx
  const startEdit = () => {
    if (!viewing) return;
    setEditForm({
      patient_name: viewing.patient_name,
      patient_id: viewing.patient_id || "",
      diagnosis: viewing.diagnosis || "",
      medications: viewing.medications || "",
      notes: viewing.notes || "",
      date: viewing.date,
    });
    setEditing(true);
  };
```
with:
```tsx
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
```
Replace:
```tsx
  const saveEdit = async () => {
    if (!viewing) return;
    if (!editForm.patient_name) { toast.error("Patient name is required"); return; }
    const { error } = await supabase.from("prescriptions").update({
      patient_id: editForm.patient_id || null,
      patient_name: editForm.patient_name,
      diagnosis: editForm.diagnosis || null,
      medications: editForm.medications || null,
      notes: editForm.notes || null,
      date: editForm.date,
    }).eq("id", viewing.id);
```
with:
```tsx
  const saveEdit = async () => {
    if (!viewing) return;
    if (!editForm.patient_name) { toast.error("Patient name is required"); return; }
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
```
(the rest of `saveEdit`'s body — the `if (error) {...}` block and everything after — stays unchanged).

- [ ] **Step 6: Add Age/Weight inputs to the New Prescription form**

In the "Add Prescription" `DialogContent`, replace:
```tsx
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
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><Stethoscope className="h-3.5 w-3.5" /> Diagnosis</Label>
```
with:
```tsx
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
                  <Input type="number" min={0} value={form.patient_age} onChange={(e) => setForm({ ...form, patient_age: e.target.value })} className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label>Weight (kg)</Label>
                  <Input type="number" min={0} step="0.1" value={form.patient_weight} onChange={(e) => setForm({ ...form, patient_weight: e.target.value })} className="h-10" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><Stethoscope className="h-3.5 w-3.5" /> Diagnosis</Label>
```

- [ ] **Step 7: Add the same Age/Weight inputs to the Edit form**

In the Sheet's editing-mode form, replace:
```tsx
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
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5"><Stethoscope className="h-3.5 w-3.5" /> Diagnosis</Label>
```
with:
```tsx
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
                      <Input type="number" min={0} value={editForm.patient_age} onChange={(e) => setEditForm({ ...editForm, patient_age: e.target.value })} className="h-10" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Weight (kg)</Label>
                      <Input type="number" min={0} step="0.1" value={editForm.patient_weight} onChange={(e) => setEditForm({ ...editForm, patient_weight: e.target.value })} className="h-10" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5"><Stethoscope className="h-3.5 w-3.5" /> Diagnosis</Label>
```

- [ ] **Step 8: Add the Download button to the detail Sheet's view mode**

Replace:
```tsx
                  {can("prescriptions.edit") && (
                  <div className="pt-2">
                    <Button onClick={startEdit} className="w-full h-10 bg-royal hover:bg-royal/90">
                      <Pencil className="h-4 w-4 mr-2" /> Edit
                    </Button>
                  </div>
                  )}
```
with:
```tsx
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
```

- [ ] **Step 9: Render `PrescriptionSlip`**

Add just before the closing `</div>` of the component's root (after the existing "Bulk delete confirmation" `AlertDialog`, alongside the other modal-type elements):
```tsx
      <PrescriptionSlip
        open={slipOpen}
        onClose={() => setSlipOpen(false)}
        profile={profile}
        prescription={slipPrescription}
        onDownload={downloadSlip}
      />
```

- [ ] **Step 10: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add src/components/admin/PrescriptionsPage.tsx
git commit -m "feat: add Age/Weight fields and Download flow to Prescriptions"
```

---

### Task 5: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass except the already-known, pre-existing, unrelated `BlogPage.test.tsx` failures (confirmed in this project's history to predate and be unrelated to this work — do not attempt to fix them here).

- [ ] **Step 2: Full project typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 3: Manual QA — create, download, and visually compare**

Using a real test doctor: create a new prescription with a linked patient (Age, Weight filled in, Gender should auto-fill from the patient record), confirm the slip preview opens automatically, click "Download PDF", and open the resulting file — compare against the reference template (blue header with doctor name/qualification, patient info row with Age/Gender/Weight, Diagnosis line, Rx body with medications, signature line, clinic footer). Then open an existing prescription with no linked patient from the list, click Download from its detail Sheet, and confirm Gender/Age/Weight show `—` where not set.

- [ ] **Step 4: Confirm the `BookingWidget.tsx` refactor caused no regression**

Re-run the appointment-slip download check from Task 2 Step 4 one more time now that all other tasks are complete, to catch any accidental interaction.
