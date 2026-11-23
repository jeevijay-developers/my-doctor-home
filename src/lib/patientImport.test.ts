import { describe, expect, it, vi } from "vitest";
import { importPatients, type SendImportFn } from "./patientImport";
import type { ImportRow } from "./patientCsv";

const row = (n: number, over: Partial<ImportRow> = {}): ImportRow => ({
  line: n + 1, name: `Patient ${n}`, phone: `98765${String(n).padStart(5, "0")}`, email: null, age: 30, gender: "male", weight: null, notes: null,
  patient_since: null, first_visit: null, last_visit: null, total_visits: 0, ...over,
});

const reply = (data: unknown): SendImportFn => vi.fn(async () => ({ data, error: null }));

describe("importPatients", () => {
  it("sends the validated rows in ONE call, without a doctor id, with the file name", async () => {
    const send = reply({ ok: true, inserted: 1, duplicates: 0, rejected: [], rejected_count: 0 });
    await importPatients([row(1, { email: "a@b.co", weight: 62.5, notes: "n", age: 0, gender: "female", patient_since: "2019-03-15", first_visit: "2019-03-15", last_visit: "2025-09-02", total_visits: 14 })], send, "demo.csv");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      [{ name: "Patient 1", phone: "9876500001", email: "a@b.co", age: 0, gender: "female", weight: 62.5, notes: "n", patient_since: "2019-03-15", first_visit: "2019-03-15", last_visit: "2025-09-02", total_visits: 14 }],
      "demo.csv",
    );
  });

  it("reports what the server added and skipped", async () => {
    const out = await importPatients([row(1), row(2)], reply({ ok: true, inserted: 1, duplicates: 1, rejected: [], rejected_count: 0 }), "f.csv");
    expect(out).toEqual({ ok: true, imported: 1, duplicates: 1, rejected: [], rejectedCount: 0 });
  });

  it("maps a rejected row back to its file line and name", async () => {
    const out = await importPatients([row(1), row(2), row(3)], reply({ ok: true, inserted: 2, duplicates: 0, rejected: [{ index: 2, error: "PHONE" }], rejected_count: 1 }), "f.csv");
    expect(out).toMatchObject({ ok: true, imported: 2 });
    expect(out.ok && out.rejected).toEqual([{ line: 3, name: "Patient 2", message: "The phone number is not a valid Indian mobile number." }]);
  });

  it.each([
    ["NOT_ELIGIBLE", {}, /Pro and Premium/],
    ["DAILY_LIMIT", {}, /today/i],
    ["CAP_EXCEEDED", { cap: 10, current: 8, incoming: 5 }, /13 patients, above your limit of 10/],
  ])("turns %s into a plain message and keeps the code", async (code, extra, pattern) => {
    const out = await importPatients([row(1)], reply({ ok: false, error: code, ...extra }), "f.csv");
    expect(out.ok).toBe(false);
    expect((out as any).code).toBe(code);
    expect((out as any).message).toMatch(pattern);
  });

  it("treats a transport error or an unreadable answer as a failed import", async () => {
    const down: SendImportFn = async () => ({ data: null, error: { message: "network" } });
    expect(await importPatients([row(1)], down, "f.csv")).toMatchObject({ ok: false, code: "FAILED" });
    expect(await importPatients([row(1)], reply(null), "f.csv")).toMatchObject({ ok: false, code: "FAILED" });
  });

  it("recognises a refusal raised by the database", async () => {
    const refused: SendImportFn = async () => ({ data: null, error: { message: "NOT_ALLOWED" } });
    expect(await importPatients([row(1)], refused, "f.csv")).toMatchObject({ ok: false, code: "NOT_ALLOWED" });
  });

  it("does not call the server for an empty file", async () => {
    const send = reply({ ok: true });
    expect(await importPatients([], send, "f.csv")).toEqual({ ok: true, imported: 0, duplicates: 0, rejected: [], rejectedCount: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it("treats an answer without ok as a failure, and keeps an unknown error code", async () => {
    expect(await importPatients([row(1)], reply({ inserted: 1 }), "f.csv")).toMatchObject({ ok: false, code: "FAILED" });
    expect(await importPatients([row(1)], reply("oops"), "f.csv")).toMatchObject({ ok: false, code: "FAILED" });
    expect(await importPatients([row(1)], reply({ ok: false }), "f.csv")).toMatchObject({ ok: false, code: "FAILED" });
    expect(await importPatients([row(1)], reply({ ok: false, error: "WEIRD" }), "f.csv")).toMatchObject({ ok: false, code: "WEIRD" });
  });

  it("turns a thrown call into a failed import", async () => {
    const boom: SendImportFn = async () => {
      throw new Error("offline");
    };
    expect(await importPatients([row(1)], boom, "f.csv")).toMatchObject({ ok: false, code: "FAILED" });
  });

  it("skips rejected entries it cannot place but keeps the true total", async () => {
    const out = await importPatients(
      [row(1), row(2)],
      reply({ ok: true, inserted: 0, duplicates: 0, rejected: [{ index: 0, error: "NAME" }, { index: 9, error: "NAME" }, { index: "x", error: "NAME" }, { index: "2", error: "AGE" }, null], rejected_count: 5 }),
      "f.csv",
    );
    expect(out.ok && out.rejected).toEqual([{ line: 3, name: "Patient 2", message: "The age must be a number from 0 to 120." }]);
    expect(out.ok && out.rejectedCount).toBe(5);
  });

  it("reads numbers sent as strings and ignores a rejected list that is not an array", async () => {
    const out = await importPatients([row(1)], reply({ ok: true, inserted: "3", duplicates: "2", rejected: "none", rejected_count: "0" }), "f.csv");
    expect(out).toEqual({ ok: true, imported: 3, duplicates: 2, rejected: [], rejectedCount: 0 });
  });

  it("says the file is too large when the server refuses a payload with few rows", async () => {
    const out = await importPatients([row(1)], reply({ ok: false, error: "PAYLOAD_INVALID", max_rows: 1000 }), "f.csv");
    expect((out as any).message).toMatch(/too large to import in one go/i);
  });

  it("keeps the 1,000-patient message when more rows than allowed were sent", async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => row(i));
    const out = await importPatients(rows, reply({ ok: false, error: "PAYLOAD_INVALID", max_rows: 1000 }), "f.csv");
    expect((out as any).message).toMatch(/at most 1,000 patients/);
  });

  it("refuses an oversized payload without calling the server", async () => {
    const send = reply({ ok: true });
    const out = await importPatients([row(1, { notes: "x".repeat(2_200_000) })], send, "f.csv");
    expect(send).not.toHaveBeenCalled();
    expect(out).toMatchObject({ ok: false, code: "PAYLOAD_INVALID" });
    expect((out as any).message).toMatch(/too large to import in one go/i);
  });

  it("formats large cap numbers sent as strings", async () => {
    const out = await importPatients([row(1)], reply({ ok: false, error: "CAP_EXCEEDED", cap: "100000", current: "99000", incoming: "1500" }), "f.csv");
    expect((out as any).message).toBe("This file would take you to 1,00,500 patients, above your limit of 1,00,000.");
  });
});
