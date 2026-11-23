import type { ImportRow } from "./patientCsv";
import { MAX_PAYLOAD_BYTES, TOO_LARGE_MESSAGE, importErrorMessage, rowErrorMessage } from "./patientImportApi";

// What the server needs per patient. The clinic is NOT sent: the database works it out from
// the signed-in user, so a payload can never import into someone else's clinic.
export type ImportPayloadRow = {
  name: string;
  phone: string;
  email: string | null;
  age: number;
  gender: string;
  weight: number | null;
  notes: string | null;
  patient_since: string | null;
  first_visit: string | null;
  last_visit: string | null;
  total_visits: number;
};

export type SendImportFn = (
  rows: ImportPayloadRow[],
  fileName: string,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export type ImportFailure = { line: number; name: string; message: string };

// `rejected` lists at most 100 rows (the server's cap); `rejectedCount` is the true total.
export type ImportOutcome =
  | { ok: true; imported: number; duplicates: number; rejected: ImportFailure[]; rejectedCount: number }
  | { ok: false; code: string; message: string };

const toPayload = (r: ImportRow): ImportPayloadRow => ({
  name: r.name,
  phone: r.phone,
  email: r.email,
  age: r.age,
  gender: r.gender,
  weight: r.weight,
  notes: r.notes,
  patient_since: r.patient_since,
  first_visit: r.first_visit,
  last_visit: r.last_visit,
  total_visits: r.total_visits,
});

const failed = (code: string, message: string): ImportOutcome => ({ ok: false, code, message });
const generalFailure = () => failed("FAILED", importErrorMessage("FAILED"));
const count = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// One call, one transaction: the database either imports the lot (minus duplicates and rows it
// rejects) or refuses with a reason. Nothing is retried row by row any more.
export async function importPatients(rows: ImportRow[], send: SendImportFn, fileName: string): Promise<ImportOutcome> {
  // Nothing to send: do not spend one of the day's imports on an empty file.
  if (rows.length === 0) return { ok: true, imported: 0, duplicates: 0, rejected: [], rejectedCount: 0 };

  const payload = rows.map(toPayload);
  // The server refuses an oversized payload; check first so no call (or daily import) is wasted.
  if (new TextEncoder().encode(JSON.stringify(payload)).length > MAX_PAYLOAD_BYTES) {
    return failed("PAYLOAD_INVALID", TOO_LARGE_MESSAGE);
  }

  let res: Awaited<ReturnType<SendImportFn>>;
  try {
    res = await send(payload, fileName);
  } catch {
    return generalFailure();
  }
  const { data, error } = res;

  if (error) {
    return String(error.message ?? "").includes("NOT_ALLOWED")
      ? failed("NOT_ALLOWED", importErrorMessage("NOT_ALLOWED"))
      : generalFailure();
  }
  const r = data as Record<string, any> | null;
  if (!r || typeof r !== "object") return generalFailure();

  if (r.ok === false) {
    const code = String(r.error ?? "FAILED");
    return failed(code, importErrorMessage(code, { ...r, sent_rows: rows.length }));
  }
  if (r.ok !== true) return generalFailure();

  // `index` is the 1-based position in what was sent. An entry we cannot place is skipped; it
  // still counts in rejectedCount.
  const rejected: ImportFailure[] = [];
  for (const x of Array.isArray(r.rejected) ? r.rejected : []) {
    const src = rows[Number(x?.index) - 1];
    if (src) rejected.push({ line: src.line, name: src.name, message: rowErrorMessage(String(x.error)) });
  }
  return {
    ok: true,
    imported: count(r.inserted),
    duplicates: count(r.duplicates),
    rejected,
    rejectedCount: Math.max(count(r.rejected_count), rejected.length),
  };
}
