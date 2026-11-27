# Patient CSV Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a doctor (or staff with `patients.add`) import a patient list from CSV on the Patients page, and make the CSV export use the same column definition so an export re-imports cleanly.

**Architecture:** Pure logic lives in two small `src/lib` modules: `patientCsv.ts` (parse, clean, validate, build export/template) and `patientImport.ts` (chunked insert with per-row fallback, injected insert function so it is testable without Supabase). A new `PatientImportDialog` does file pick -> preview -> import -> result. `PatientsPage` only gains an Import button and calls the shared export builder.

**Tech Stack:** React 18, TypeScript, Vitest + Testing Library, Supabase JS. No CSV library is installed, so a small RFC 4180 parser is written (quotes, `""`, CRLF, BOM).

## Global Constraints

- Validation must be identical to the Add Patient form: reuse `nameError`, `ageError`, `genderError`, `weightError`, `emailError`, `parseWeight` from `src/lib/patientIntake.ts`, and `isValidIndianPhone` / `normalizeIndianPhone` / `phoneErrorMessage` from `src/lib/phone.ts`. Name, phone, age, gender required; weight, email, notes optional.
- Duplicate rule mirrors the DB unique index `uq_patients_doctor_phone_name`: same `phone` + `lower(btrim(name))` for the doctor. Duplicates are skipped, never overwritten.
- Import never sets visit counts or dates (system-calculated); those columns in an export file are ignored.
- Limits: 1000 data rows and 2 MB per file.
- CSV safety: cells starting with `= + - @` are exported with a leading `'` (existing `csvCell`); import strips that guard. Phone is exported as `="digits"` (existing behaviour); import strips that wrapper.
- Only users with `patients.add` see Import; it is disabled during the trial grace period (`writeDisabled`), same as Add Patient.
- `src/integrations/supabase/*` is generated; do not hand-edit.

## File Structure

- Create `src/lib/patientCsv.ts`: `parseCsv`, `cleanCell`, `parsePatientCsv`, `patientKey`, `splitDuplicates`, `patientsToCsv`, `patientImportTemplate`, constants.
- Create `src/lib/patientCsv.test.ts`.
- Create `src/lib/patientImport.ts`: `importPatients`.
- Create `src/lib/patientImport.test.ts`.
- Create `src/components/admin/PatientImportDialog.tsx` (+ `.test.tsx`).
- Modify `src/components/admin/PatientsPage.tsx`: Import button, use `patientsToCsv`.
- Modify `src/components/admin/PatientsPage.test.tsx`: button visibility, export header.
- Modify `CLAUDE.md`: one bullet.

---

### Task 1: CSV parsing and cell cleaning

**Files:** Create `src/lib/patientCsv.ts`, `src/lib/patientCsv.test.ts`

**Interfaces:**
- Produces: `parseCsv(text: string): string[][]`, `cleanCell(raw: string): string`

- [ ] **Step 1: Failing tests** for: quoted commas, `""` escapes, newline inside quotes, CRLF, BOM, trailing blank line dropped; `cleanCell('="9876543210"')` -> `9876543210`, `cleanCell("'=HYPERLINK(1)")` -> `=HYPERLINK(1)`, `cleanCell("  Ravi  ")` -> `Ravi`, an ordinary leading apostrophe (`'Tis`) is kept.
- [ ] **Step 2: Run** `npx vitest run src/lib/patientCsv.test.ts` -> FAIL (module missing).
- [ ] **Step 3: Implement** a char-by-char state machine (`inQuotes`), then `cleanCell` with regexes `/^="(.*)"$/` and `/^'([=+\-@].*)$/`.
- [ ] **Step 4: Run** -> PASS.

### Task 2: Row parsing and validation

**Files:** Modify `src/lib/patientCsv.ts`, `src/lib/patientCsv.test.ts`

**Interfaces:**
- Consumes: Task 1 functions; helpers listed in Global Constraints.
- Produces:
  ```ts
  type ImportRow = { line: number; name: string; phone: string; email: string | null; age: number; gender: "male"|"female"|"other"; weight: number | null; notes: string | null };
  type RowError = { line: number; name: string; messages: string[] };
  parsePatientCsv(text: string): { rows: ImportRow[]; errors: RowError[]; fileError: string | null };
  patientKey(name: string, phone: string): string;
  splitDuplicates(rows: ImportRow[], existing: Set<string>): { fresh: ImportRow[]; duplicates: ImportRow[] };
  MAX_IMPORT_ROWS = 1000; MAX_IMPORT_BYTES = 2 * 1024 * 1024
  ```

- [ ] **Step 1: Failing tests**: happy path; header aliases (`Patient Name`, `Mobile`, `Sex`, `Weight`, case-insensitive); missing required column -> `fileError` naming it; empty file; unknown columns ignored; blank rows skipped; all problems of a row reported together; `9.87654E+09` phone -> spreadsheet-format message; `+91 98765 43210` normalises to 10 digits; `34 years` age; `M`/`f`/`FEMALE` gender; `62.5 kg` weight; bad email; more than 1000 rows -> `fileError`; `splitDuplicates` removes rows whose key is in `existing` and the 2nd occurrence inside the file; `line` equals the file line number (header = line 1).
- [ ] **Step 2: Run** -> FAIL.
- [ ] **Step 3: Implement**: normalise header (`lower`, strip non-alphanumerics) -> field via alias table; validate each row with the shared helpers; key = `${phone}|${name.trim().toLowerCase()}`.
- [ ] **Step 4: Run** -> PASS.

### Task 3: Export builder, template, round trip

**Files:** Modify `src/lib/patientCsv.ts`, `src/lib/patientCsv.test.ts`

**Interfaces:**
- Produces: `patientsToCsv(rows: PatientExportRow[]): string` (starts with BOM), `patientImportTemplate(): string`, `PATIENT_EXPORT_HEADERS`.
  `PatientExportRow = { name; phone; email; age; gender; weight; first_visit; last_visit; total_visits; notes }` (nullable where the DB is).

- [ ] **Step 1: Failing tests**: header row is exactly `Name,Phone,Email,Age,Gender,Weight (kg),First Visit,Last Visit,Total Visits,Notes`; phone written as `="..."`; dates `DD/MM/YYYY`; formula in a name is neutralised; **round trip**: `parsePatientCsv(patientsToCsv(rows))` returns the same name/phone/email/age/gender/weight/notes for valid rows (including a name with a comma and a name starting with `=`); template parses with zero errors and 2 sample rows.
- [ ] **Step 2: Run** -> FAIL.
- [ ] **Step 3: Implement** moving the existing logic out of `PatientsPage.exportPatients` unchanged in behaviour (`asText`, `fmtDate`, `csvCell`).
- [ ] **Step 4: Run** -> PASS.

### Task 4: Chunked import with fallback

**Files:** Create `src/lib/patientImport.ts`, `src/lib/patientImport.test.ts`

**Interfaces:**
- Consumes: `ImportRow`
- Produces:
  ```ts
  type InsertFn = (rows: PatientInsert[]) => Promise<{ error: { code?: string; message: string } | null }>;
  importPatients(doctorId: string, rows: ImportRow[], insert: InsertFn, onProgress?: (done: number, total: number) => void):
    Promise<{ imported: number; duplicates: number; failed: { line: number; name: string; message: string }[] }>;
  ```

- [ ] **Step 1: Failing tests**: 250 rows -> 3 insert calls (100/100/50), all imported; DB row carries `doctor_id`, no `auto_created`; a chunk that errors is retried row by row so only the bad row fails; `23505` on a single row counts as duplicate, not failure; progress callback reaches total.
- [ ] **Step 2: Run** -> FAIL. **Step 3: Implement.** **Step 4: Run** -> PASS.

### Task 5: Import dialog

**Files:** Create `src/components/admin/PatientImportDialog.tsx`, `.test.tsx`

**Interfaces:**
- Consumes: Tasks 2-4. Props: `{ open: boolean; onOpenChange(o: boolean): void; doctorId: string; onImported(): void }`.

- [ ] **Step 1: Failing tests** (Testing Library, `createTableMock`): choosing a valid file shows "N ready to import", duplicates count and per-line errors; a file missing a column shows the file error and no Import button; Import button inserts only fresh rows and then shows the result summary and calls `onImported`; oversized file rejected; "Download template" produces a CSV blob.
- [ ] **Step 2: Run** -> FAIL.
- [ ] **Step 3: Implement** stages `pick -> preview -> importing -> done`; existing keys loaded by paging `patients` (`name, phone`, 1000 per page) when a file is chosen.
- [ ] **Step 4: Run** -> PASS.

### Task 6: Wire into Patients page

**Files:** Modify `PatientsPage.tsx`, `PatientsPage.test.tsx`, `CLAUDE.md`

- [ ] **Step 1: Failing tests**: doctor sees "Import CSV"; staff without `patients.add` does not; disabled in grace; clicking opens the dialog; existing export tests still pass with the shared builder.
- [ ] **Step 2: Run** -> FAIL. **Step 3: Implement** (button next to Export CSV; `exportPatients` calls `patientsToCsv`). **Step 4:** run the full suite and `npx tsc --noEmit -p tsconfig.app.json` (3 old errors only).

## Self-review

- Spec: import with all patient-form fields (T2), export aligned and round-trippable (T3), validation same as form (T2), duplicates (T2/T4), staff permission (T6), preview and result (T5).
- No placeholders; names used across tasks (`ImportRow`, `parsePatientCsv`, `splitDuplicates`, `patientsToCsv`, `importPatients`) match.
