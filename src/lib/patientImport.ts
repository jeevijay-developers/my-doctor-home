import type { ImportRow } from "./patientCsv";

export type PatientInsert = {
  doctor_id: string;
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

export type InsertFn = (rows: PatientInsert[]) => Promise<{ error: { code?: string; message: string } | null }>;

export type ImportResult = {
  imported: number;
  duplicates: number;
  failed: { line: number; name: string; message: string }[];
};

const CHUNK_SIZE = 100;
const UNIQUE_VIOLATION = "23505";

const toInsert = (doctorId: string, r: ImportRow): PatientInsert => ({
  doctor_id: doctorId,
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

// Inserts in chunks (one request per 100 patients). If a chunk is refused, its rows are retried
// one by one so a single bad row only fails itself. A unique violation on a single row means the
// patient appeared since the preview was made (another tab, a booking), so it counts as a duplicate.
export async function importPatients(
  doctorId: string,
  rows: ImportRow[],
  insert: InsertFn,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, duplicates: 0, failed: [] };
  let done = 0;

  for (let start = 0; start < rows.length; start += CHUNK_SIZE) {
    const chunk = rows.slice(start, start + CHUNK_SIZE);
    const { error } = await insert(chunk.map((r) => toInsert(doctorId, r)));
    if (!error) {
      result.imported += chunk.length;
    } else {
      for (const r of chunk) {
        const single = await insert([toInsert(doctorId, r)]);
        if (!single.error) result.imported += 1;
        else if (single.error.code === UNIQUE_VIOLATION) result.duplicates += 1;
        else result.failed.push({ line: r.line, name: r.name, message: "Could not be saved." });
      }
    }
    done += chunk.length;
    onProgress?.(done, rows.length);
  }
  return result;
}
