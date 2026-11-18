// CSV import / export for the Patients page. Import uses the same rules as the Add Patient
// form (see patientIntake.ts); export is built here so the two can never drift apart.
import { csvCell } from "./csv";
import { ageError, emailError, nameError, parseWeight, weightError } from "./patientIntake";
import { isValidIndianPhone, normalizeIndianPhone, phoneErrorMessage } from "./phone";

export const MAX_IMPORT_ROWS = 1000;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const MAX_NOTES_LENGTH = 2000;

type CsvLine = { line: number; cells: string[] };

// RFC 4180 reader: quoted cells, "" escapes, newlines inside quotes, CRLF, a leading BOM.
// Lines with no content are dropped, but every kept row remembers its real line in the file.
function parseCsvLines(text: string): CsvLine[] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: CsvLine[] = [];
  let cells: string[] = [];
  let cell = "";
  let inQuotes = false;
  let line = 1;
  let rowLine = 1;

  const endCell = () => { cells.push(cell); cell = ""; };
  const endRow = () => {
    endCell();
    if (cells.some((c) => c.trim() !== "")) rows.push({ line: rowLine, cells });
    cells = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false;
      } else {
        if (ch === "\n") line++;
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      endCell();
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      endRow();
      line++;
      rowLine = line;
    } else cell += ch;
  }
  if (cell !== "" || cells.length > 0) endRow();
  return rows;
}

export function parseCsv(text: string): string[][] {
  return parseCsvLines(text).map((r) => r.cells);
}

// Undo what the exporter does to a cell: trim, unwrap ="digits" (keeps Excel from turning a
// phone number into 9.87E+09) and drop the apostrophe that neutralises a leading = + - @.
export function cleanCell(raw: string): string {
  let v = raw.trim();
  const wrapped = v.match(/^="(.*)"$/);
  if (wrapped) v = wrapped[1].trim();
  const guarded = v.match(/^'([=+\-@].*)$/);
  if (guarded) v = guarded[1];
  return v;
}

export type Gender = "male" | "female" | "other";

export type ImportRow = {
  line: number;
  name: string;
  phone: string;
  email: string | null;
  age: number;
  gender: Gender;
  weight: number | null;
  notes: string | null;
};

export type RowError = { line: number; name: string; messages: string[] };

type Field = "name" | "phone" | "email" | "age" | "gender" | "weight" | "notes";

const HEADER_ALIASES: Record<string, Field> = {
  name: "name", patientname: "name", fullname: "name", patient: "name",
  phone: "phone", phonenumber: "phone", phoneno: "phone", mobile: "phone", mobilenumber: "phone", mobileno: "phone", contact: "phone", contactnumber: "phone",
  email: "email", emailaddress: "email", emailid: "email",
  age: "age", ageyears: "age",
  gender: "gender", sex: "gender",
  weight: "weight", weightkg: "weight", weightinkg: "weight",
  notes: "notes", note: "notes", remarks: "notes", comments: "notes",
};

const REQUIRED: { field: Field; label: string }[] = [
  { field: "name", label: "Name" },
  { field: "phone", label: "Phone" },
  { field: "age", label: "Age" },
  { field: "gender", label: "Gender" },
];

const normaliseHeader = (h: string) => cleanCell(h).toLowerCase().replace(/[^a-z0-9]/g, "");

const GENDERS: Record<string, Gender> = { m: "male", male: "male", f: "female", female: "female", o: "other", other: "other" };

function validateRow(line: number, get: (f: Field) => string): { row?: ImportRow; error?: RowError } {
  const messages: string[] = [];

  const name = get("name").replace(/\s+/g, " ");
  const nameProblem = nameError(name);
  if (nameProblem) messages.push(nameProblem);

  const phoneRaw = get("phone");
  let phone = "";
  if (/^\d+(\.\d+)?e\+?\d+$/i.test(phoneRaw)) {
    messages.push("Phone looks like scientific notation (a spreadsheet changed it). Format the Phone column as Text and enter the full number.");
  } else if (!phoneRaw) {
    messages.push("Phone number is required");
  } else if (!isValidIndianPhone(phoneRaw)) {
    messages.push(phoneErrorMessage);
  } else {
    phone = normalizeIndianPhone(phoneRaw);
  }

  const ageRaw = get("age").replace(/\s*(years?|yrs?|y)\.?$/i, "");
  const ageProblem = ageError(ageRaw);
  if (ageProblem) messages.push(ageProblem);

  const gender = GENDERS[get("gender").toLowerCase()];
  if (!gender) messages.push("Gender must be Male, Female or Other");

  const weightRaw = get("weight").replace(/\s*kgs?\.?$/i, "");
  const weightProblem = weightError(weightRaw);
  if (weightProblem) messages.push(weightProblem);

  const email = get("email");
  const emailProblem = emailError(email);
  if (emailProblem) messages.push(emailProblem);

  const notes = get("notes");
  if (notes.length > MAX_NOTES_LENGTH) messages.push(`Notes are too long (${MAX_NOTES_LENGTH} characters at most)`);

  if (messages.length > 0) return { error: { line, name: name || "(no name)", messages } };
  return {
    row: { line, name, phone, email: email || null, age: Number(ageRaw), gender, weight: parseWeight(weightRaw), notes: notes || null },
  };
}

export type ParsedPatientCsv = { rows: ImportRow[]; errors: RowError[]; fileError: string | null };

export function parsePatientCsv(text: string): ParsedPatientCsv {
  const fail = (fileError: string): ParsedPatientCsv => ({ rows: [], errors: [], fileError });
  const lines = parseCsvLines(text);
  if (lines.length === 0) return fail("The file is empty.");

  const columnOf: Partial<Record<Field, number>> = {};
  lines[0].cells.forEach((h, i) => {
    const field = HEADER_ALIASES[normaliseHeader(h)];
    if (field && columnOf[field] === undefined) columnOf[field] = i;
  });
  const missing = REQUIRED.filter((r) => columnOf[r.field] === undefined).map((r) => r.label);
  if (missing.length > 0) return fail(`Missing required column(s): ${missing.join(", ")}`);

  const data = lines.slice(1);
  if (data.length === 0) return fail("The file has no patient rows below the header.");
  if (data.length > MAX_IMPORT_ROWS) return fail(`A file can have at most ${MAX_IMPORT_ROWS} patients (this one has ${data.length}).`);

  const rows: ImportRow[] = [];
  const errors: RowError[] = [];
  for (const { line, cells } of data) {
    const get = (f: Field) => {
      const idx = columnOf[f];
      return idx === undefined ? "" : cleanCell(cells[idx] ?? "");
    };
    const { row, error } = validateRow(line, get);
    if (row) rows.push(row);
    if (error) errors.push(error);
  }
  return { rows, errors, fileError: null };
}

// Same identity as the database unique index uq_patients_doctor_phone_name.
export function patientKey(name: string, phone: string): string {
  return `${phone}|${name.trim().toLowerCase()}`;
}

// Rows already in the clinic's patient list, or repeated earlier in the same file, are skipped.
export function splitDuplicates(rows: ImportRow[], existing: Set<string>): { fresh: ImportRow[]; duplicates: ImportRow[] } {
  const seen = new Set(existing);
  const fresh: ImportRow[] = [];
  const duplicates: ImportRow[] = [];
  for (const r of rows) {
    const key = patientKey(r.name, r.phone);
    if (seen.has(key)) duplicates.push(r);
    else { seen.add(key); fresh.push(r); }
  }
  return { fresh, duplicates };
}

// ---------------------------------------------------------------------------
// Export and template
// ---------------------------------------------------------------------------

export const PATIENT_EXPORT_HEADERS = [
  "Name", "Phone", "Email", "Age", "Gender", "Weight (kg)", "First Visit", "Last Visit", "Total Visits", "Notes",
] as const;

export type PatientExportRow = {
  name: string;
  phone: string;
  email: string | null;
  age: number | null;
  gender: string | null;
  weight?: number | null;
  first_visit: string | null;
  last_visit: string | null;
  total_visits: number;
  notes: string | null;
};

// Forces a spreadsheet to keep the value as text (no 9.87E+09 phone numbers, no #### dates).
const asText = (v: string | number | null | undefined): string => {
  if (v === null || v === undefined || v === "") return "";
  return `="${String(v).replace(/"/g, '""')}"`;
};

// Stored as YYYY-MM-DD, shown as DD/MM/YYYY.
const formatDate = (d: string | null | undefined): string => {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return y && m && day ? `${day}/${m}/${y}` : d;
};

const toCsv = (headers: readonly string[], rows: string[][]) =>
  "\ufeff" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

export function patientsToCsv(patients: PatientExportRow[]): string {
  return toCsv(
    PATIENT_EXPORT_HEADERS,
    patients.map((p) => [
      csvCell(p.name),
      asText(p.phone),
      csvCell(p.email),
      String(p.age ?? ""),
      csvCell(p.gender),
      String(p.weight ?? ""),
      asText(formatDate(p.first_visit)),
      asText(formatDate(p.last_visit)),
      String(p.total_visits),
      csvCell(p.notes),
    ]),
  );
}

const TEMPLATE_HEADERS = ["Name", "Phone", "Email", "Age", "Gender", "Weight (kg)", "Notes"] as const;

export function patientImportTemplate(): string {
  return toCsv(TEMPLATE_HEADERS, [
    [csvCell("Ravi Kumar"), asText("9876543210"), csvCell("ravi@example.com"), "40", "Male", "72.5", csvCell("Diabetic")],
    [csvCell("Meena Sharma"), asText("9876543211"), "", "29", "Female", "", ""],
  ]);
}
