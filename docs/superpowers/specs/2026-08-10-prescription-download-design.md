# Design: Downloadable Prescription Slip

**Status:** Approved by user, ready for implementation planning
**Date:** 2026-08-10
**Scope:** `src/components/admin/PrescriptionsPage.tsx`, a new `PrescriptionSlip.tsx` component, a shared
`downloadPdfFromNode` utility extracted from `BookingWidget.tsx`, and a migration adding two columns
to `prescriptions`.

## Context & pre-existing state (confirmed by reading the actual code, not assumed)

- This app already has an established pattern for "generate a styled, downloadable document from
  live data": `AppointmentSlip.tsx` and `PaymentSlip.tsx` render a styled HTML card inside a
  `Dialog` preview, and a `downloadPdfFromNode(selector, filename)` helper (currently defined
  inline in `BookingWidget.tsx`, not shared) uses `html2canvas` to rasterize that DOM node, then
  `jsPDF` to embed it as an image in a single-page A4 PDF. A separate, unrelated pattern
  (`src/lib/invoicePdf.ts`) builds a PDF via jsPDF's own low-level drawing primitives (text/line/
  rect calls) with no HTML rendering at all — used for tax invoices, where pixel-perfect layout
  fidelity to a specific reference image isn't the goal. Given the user's reference is a specific
  visual template, the HTML-render-then-rasterize pattern is the right fit, not invoicePdf's.
- `downloadPdfFromNode` is only ever used by `BookingWidget.tsx` today (confirmed via grep) — it
  is not a shared utility, so a second real consumer (this feature) is reason to extract it.
- `prescriptions` table columns (confirmed via `information_schema`): `id, doctor_id, patient_id,
  patient_name, diagnosis, medications, notes, date, created_at`. No `age`, `gender`, or `weight`.
- `profiles` table columns actually include `full_name, specialization, phone, clinic_name, city,
  address, qualifications` — confirmed via `information_schema` (note: `AppointmentSlip.tsx`
  references `profile.clinic_address`/`clinic_phone`/`clinic_email`/`tagline`, none of which are
  real columns; it silently falls back to `address`/`phone` when those are `undefined`. This new
  feature maps directly to the real columns and does not repeat that pattern).
- `patients.gender` exists and is the source for auto-filled Gender when a prescription has a
  `patient_id`. `patients` has no `weight` column; the only `weight` in the schema at all lives on
  `patient_vitals` (one row per medical-record visit, from the separate Medical Records module),
  which `prescriptions` has no relationship to — confirmed via grep across `types.ts`.

## Decisions made during brainstorming

| Question | Decision |
|---|---|
| Output format | PDF, via the existing `html2canvas` + `jsPDF` pattern already used for appointment/payment slips — not a new format, not a raw PNG/JPG file. |
| Download trigger | On-demand "Download" button — next to "Edit" in the existing prescription detail `Sheet`, and offered again right after creating a new prescription. No silent auto-download on save. |
| Age / Gender / Weight source | Age and Weight become new optional number inputs on the New/Edit Prescription form (a prescription is a point-in-time snapshot; weight especially can change visit to visit, and there's no reliable existing source for either). Gender auto-fills from `patients.gender` when the prescription has a `patient_id`, with no separate input — blank if unlinked. |
| Notes on the document | Omitted — the downloadable document matches the reference template exactly (header, patient info, Rx, signature, footer). `notes` stays visible in the app's own detail view, just not on the generated PDF. |
| Doctylia branding | Not included on the slip — this is the doctor's own clinic letterhead (matches the reference template, which has no platform branding), unlike `AppointmentSlip.tsx` which does show the Doctylia logo for a different, platform-facing document. |

## Data model

**New migration** — two new nullable columns on `prescriptions`:
```sql
ALTER TABLE public.prescriptions ADD COLUMN patient_age integer;
ALTER TABLE public.prescriptions ADD COLUMN patient_weight numeric;
```
No RLS changes needed — existing `prescriptions` policies already gate by `doctor_id`/staff
permission and don't enumerate columns.

## Components

1. **`src/lib/downloadPdfFromNode.ts` (new, extracted)** — moves the existing implementation out
   of `BookingWidget.tsx` verbatim:
   ```ts
   export async function downloadPdfFromNode(selector: string, filename: string): Promise<void>
   ```
   Same behavior: dynamic-imports `html2canvas`, waits one animation frame, rasterizes the matched
   element at `scale: 2`, fits it into a single A4 page in a new `jsPDF` document, saves as
   `filename`. `BookingWidget.tsx` is updated to import this instead of defining it locally — pure
   refactor, no behavior change there.

2. **`src/components/admin/PrescriptionSlip.tsx` (new)** — modeled directly on
   `AppointmentSlip.tsx`'s structure (`Dialog` wrapping a `data-slip-print-root` card, a
   `Print`/`Download PDF`/`Close` action row). Props: `open`, `onClose`, `profile` (doctor),
   `prescription` (the row, including the two new columns), `onDownload`. Layout regions, mapped
   to real fields:
   - **Header (blue band):** `Dr. {profile.full_name}`, `{profile.qualifications}` (uppercase,
     letter-spaced), a heartbeat/cross icon (inline SVG, matching `AppointmentSlip.tsx`'s existing
     heartbeat-divider SVG pattern — no external icon asset needed).
   - **Info row:** Patient Name (`prescription.patient_name`), Date (`prescription.date`), Age
     (`prescription.patient_age`), Gender (looked up from the linked patient at load time — see
     below), Weight (`prescription.patient_weight`) — any missing value renders as `—`, matching
     the existing convention (`AppointmentSlip.tsx`'s `{r.value || "—"}`).
   - **Diagnosis line:** `prescription.diagnosis`.
   - **Rx body:** `prescription.medications`, rendered with `whitespace-pre-line` to preserve line
     breaks, matching how medications are already displayed in `PrescriptionsPage.tsx`'s detail
     view.
   - **Signature line:** a blank ruled line + "Signature" label — static, nothing to fill in.
   - **Footer (gray band):** `profile.clinic_name`, address (`profile.address` falling back to
     `profile.city`, matching the existing fallback convention), `profile.phone`.
   - Gender is resolved by `PrescriptionsPage.tsx` before opening the slip (a single lookup against
     `patients` by the prescription's `patient_id`, only when set) and passed down as part of the
     `prescription` prop rather than having `PrescriptionSlip` do its own fetch — keeps the slip
     component a pure presentational layer over data it's given, consistent with how
     `AppointmentSlip.tsx` receives fully-resolved `profile`/`settings` props rather than fetching
     internally.

3. **`PrescriptionsPage.tsx` changes:**
   - New/Edit Prescription forms gain two fields: **Age** (number input) and **Weight** (number
     input, kg) — both optional, alongside the existing Diagnosis/Medications/Notes fields.
   - The detail `Sheet` (view mode) gains a **Download** button next to the existing **Edit**
     button, opening `PrescriptionSlip` in preview mode.
   - After a successful `addPrescription()` call, in addition to closing the "Add Prescription"
     dialog as today, the newly-created prescription opens directly in the `PrescriptionSlip`
     preview (satisfying "available right after creation" without a silent auto-download).

## Explicitly out of scope

- Auto-downloading without a user click.
- Pulling Weight from the Medical Records module's per-visit vitals — that module has no
  relationship to `prescriptions` today, and wiring one is a separate, larger feature.
- Any change to `invoicePdf.ts` or the tax-invoice generation pattern — unrelated document type,
  intentionally left alone.
- Changing `AppointmentSlip.tsx`'s own branding/field-fallback behavior — only its shared
  `downloadPdfFromNode` helper is touched (extracted, not altered), as a pure refactor.

## Testing

- Vitest: a unit test for `PrescriptionSlip` rendering — given a prescription + profile, asserts
  the header/info-row/Rx/footer fields render the expected values, including the `—` fallback for
  missing Age/Weight/Gender.
- Manual QA: create a prescription with a linked patient (Gender should auto-fill) and one without
  (Gender should show `—`); download both and visually compare against the reference template.
