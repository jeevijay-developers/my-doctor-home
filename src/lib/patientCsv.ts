// CSV import / export for the Patients page. Import uses the same rules as the Add Patient
// form (see patientIntake.ts); export is built here so the two can never drift apart.
import { csvCell } from "./csv";
import { ageError, emailError, nameError, parseWeight, weightError } from "./patientIntake";
import { isValidIndianPhone, normalizeIndianPhone, phoneErrorMessage } from "./phone";
import { clinicToday } from "./queue";

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
  /** Day the patient first came to the clinic (YYYY-MM-DD), from an old system. */
  patient_since: string | null;
  first_visit: string | null;
  last_visit: string | null;
  /** Visits already made before the import. 0 when the file doesn't say. */
  total_visits: number;
};

export type RowError = { line: number; name: string; messages: string[] };

type Field = "name" | "phone" | "email" | "age" | "gender" | "weight" | "notes" | "patient_since" | "first_visit" | "last_visit" | "total_visits";

const HEADER_ALIASES: Record<string, Field> = {
  name: "name", patientname: "name", fullname: "name", patient: "name",
  phone: "phone", phonenumber: "phone", phoneno: "phone", mobile: "phone", mobilenumber: "phone", mobileno: "phone", contact: "phone", contactnumber: "phone",
  email: "email", emailaddress: "email", emailid: "email",
  age: "age", ageyears: "age",
  gender: "gender", sex: "gender",
  weight: "weight", weightkg: "weight", weightinkg: "weight",
  notes: "notes", note: "notes", remarks: "notes", comments: "notes",
  patientsince: "patient_since", since: "patient_since", registeredon: "patient_since", registrationdate: "patient_since", joined: "patient_since", joineddate: "patient_since",
  firstvisit: "first_visit", firstvisitdate: "first_visit",
  lastvisit: "last_visit", lastvisitdate: "last_visit",
  totalvisits: "total_visits", visits: "total_visits", visitcount: "total_visits", numberofvisits: "total_visits",
};

export const MAX_TOTAL_VISITS = 10000;

// Real calendar dates only: DD/MM/YYYY (what the export writes), DD-MM-YYYY, DD.MM.YYYY or
// YYYY-MM-DD. Returns YYYY-MM-DD, or null when it isn't a date that exists.
export function parseDateCell(raw: string): string | null {
  // The exporter writes dates as ="01/09/2026" so a spreadsheet keeps them as text; the quotes
  // are consumed while reading the file, which leaves a leading "=".
  const v = raw.trim().replace(/^=/, "");
  let y: number, m: number, d: number;
  let match = v.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (match) { y = +match[1]; m = +match[2]; d = +match[3]; }
  else if ((match = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) { d = +match[1]; m = +match[2]; y = +match[3]; }
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d || y < 1900) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

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

  // History dates. Blank is fine; a filled cell must be a real date that isn't in the future.
  const today = clinicToday();
  const readDate = (field: Field, label: string): string | null => {
    const raw = get(field);
    if (!raw) return null;
    const iso = parseDateCell(raw);
    if (!iso) { messages.push(`${label} must be a real date like 25/12/2023`); return null; }
    if (iso > today) { messages.push(`${label} cannot be in the future`); return null; }
    return iso;
  };
  const sinceRaw = readDate("patient_since", "Patient Since");
  const firstVisit = readDate("first_visit", "First Visit");
  const lastVisit = readDate("last_visit", "Last Visit");
  if (firstVisit && lastVisit && lastVisit < firstVisit) messages.push("Last Visit cannot be before First Visit");
  if (sinceRaw && firstVisit && sinceRaw > firstVisit) messages.push("Patient Since cannot be after First Visit");
  // Someone whose first visit was in 2021 has been a patient since at least then.
  const patientSince = sinceRaw ?? firstVisit;

  const visitsRaw = get("total_visits");
  let totalVisits = 0;
  if (visitsRaw) {
    if (!/^\d+$/.test(visitsRaw) || Number(visitsRaw) > MAX_TOTAL_VISITS) {
      messages.push(`Total Visits must be a whole number from 0 to ${MAX_TOTAL_VISITS}`);
    } else {
      totalVisits = Number(visitsRaw);
    }
  }

  if (messages.length > 0) return { error: { line, name: name || "(no name)", messages } };
  return {
    row: {
      line, name, phone, email: email || null, age: Number(ageRaw), gender, weight: parseWeight(weightRaw), notes: notes || null,
      patient_since: patientSince, first_visit: firstVisit, last_visit: lastVisit, total_visits: totalVisits,
    },
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
  "Name", "Phone", "Email", "Age", "Gender", "Weight (kg)", "Patient Since", "First Visit", "Last Visit", "Total Visits", "Notes",
] as const;

export type PatientExportRow = {
  name: string;
  phone: string;
  email: string | null;
  age: number | null;
  gender: string | null;
  weight?: number | null;
  patient_since?: string | null;
  /** When the record was added here; stands in for "Patient Since" on older rows. */
  created_at?: string | null;
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

// "Patient since" for display and export: the stored date, else the first visit, else the day
// the record was added (in clinic time).
export function patientSinceDate(p: { patient_since?: string | null; first_visit?: string | null; created_at?: string | null }): string | null {
  if (p.patient_since) return p.patient_since;
  if (p.first_visit) return p.first_visit;
  return p.created_at ? clinicToday(new Date(p.created_at)) : null;
}

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
      asText(formatDate(patientSinceDate(p))),
      asText(formatDate(p.first_visit)),
      asText(formatDate(p.last_visit)),
      String(p.total_visits),
      csvCell(p.notes),
    ]),
  );
}

const TEMPLATE_HEADERS = ["Name", "Phone", "Email", "Age", "Gender", "Weight (kg)", "Notes", "Patient Since", "First Visit", "Last Visit", "Total Visits"] as const;

export function patientImportTemplate(): string {
  return toCsv(TEMPLATE_HEADERS, [
    [csvCell("Ravi Kumar"), asText("9876543210"), csvCell("ravi@example.com"), "40", "Male", "72.5", csvCell("Diabetic"),
      asText("15/03/2019"), asText("15/03/2019"), asText("02/09/2025"), "14"],
    [csvCell("Meena Sharma"), asText("9876543211"), "", "29", "Female", "", "", "", "", "", ""],
  ]);
}
