import { describe, expect, it, vi } from "vitest";
import { importPatients, type InsertFn } from "./patientImport";
import type { ImportRow } from "./patientCsv";

const row = (n: number, over: Partial<ImportRow> = {}): ImportRow => ({
  line: n + 1, name: `Patient ${n}`, phone: `98765${String(n).padStart(5, "0")}`, email: null, age: 30, gender: "male", weight: null, notes: null,
  patient_since: null, first_visit: null, last_visit: null, total_visits: 0, ...over,
});
const rows = (count: number) => Array.from({ length: count }, (_, i) => row(i));
const ok = { error: null };

describe("importPatients", () => {
  it("inserts in chunks of 100 and reports progress", async () => {
    const insert = vi.fn<InsertFn>().mockResolvedValue(ok);
    const progress = vi.fn();

    const result = await importPatients("doc-1", rows(250), insert, progress);

    expect(insert.mock.calls.map((c) => c[0].length)).toEqual([100, 100, 50]);
    expect(result).toEqual({ imported: 250, duplicates: 0, failed: [] });
    expect(progress).toHaveBeenLastCalledWith(250, 250);
  });

  it("sends exactly the patient fields for this doctor, and never marks them auto-created", async () => {
    const insert = vi.fn<InsertFn>().mockResolvedValue(ok);

    await importPatients("doc-1", [row(1, { email: "a@b.co", weight: 62.5, notes: "n", age: 0, gender: "female" })], insert);

    expect(insert.mock.calls[0][0]).toEqual([
      { doctor_id: "doc-1", name: "Patient 1", phone: "9876500001", email: "a@b.co", age: 0, gender: "female", weight: 62.5, notes: "n", patient_since: null, first_visit: null, last_visit: null, total_visits: 0 },
    ]);
  });

  it("retries a failed chunk row by row so one bad row does not sink the rest", async () => {
    const insert = vi.fn<InsertFn>().mockImplementation(async (batch) =>
      batch.length > 1 || batch[0].name === "Patient 2" ? { error: { code: "XX000", message: "boom" } } : ok,
    );

    const result = await importPatients("doc-1", rows(4), insert);

    expect(result.imported).toBe(3);
    expect(result.failed).toEqual([{ line: 3, name: "Patient 2", message: "Could not be saved." }]);
  });

  it("counts a unique-violation on a single row as a duplicate, not a failure", async () => {
    const insert = vi.fn<InsertFn>().mockImplementation(async (batch) =>
      batch.length > 1 || batch[0].name === "Patient 1" ? { error: { code: "23505", message: "dup" } } : ok,
    );

    const result = await importPatients("doc-1", rows(3), insert);

    expect(result).toEqual({ imported: 2, duplicates: 1, failed: [] });
  });

  it("does nothing for an empty list", async () => {
    const insert = vi.fn<InsertFn>();
    expect(await importPatients("doc-1", [], insert)).toEqual({ imported: 0, duplicates: 0, failed: [] });
    expect(insert).not.toHaveBeenCalled();
  });
});
