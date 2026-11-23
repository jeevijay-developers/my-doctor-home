import { describe, expect, it } from "vitest";
import { importErrorMessage, rowErrorMessage } from "./patientImportApi";

describe("importErrorMessage daily limit details", () => {
  it("tells how many more patients fit when only the row limit is reached", () => {
    expect(importErrorMessage("DAILY_LIMIT", { imports_today: 1, max_per_day: 3, rows_today: 900, max_rows_per_day: 1000 })).toBe(
      "You can import 100 more patients in the next 24 hours.",
    );
    expect(importErrorMessage("DAILY_LIMIT", { imports_today: 1, max_per_day: 3, rows_today: 1200, max_rows_per_day: 1000 })).toBe(
      "You can import 0 more patients in the next 24 hours.",
    );
  });
  it("tells the import-count limit when it is reached", () => {
    expect(importErrorMessage("DAILY_LIMIT", { imports_today: 3, max_per_day: 3, rows_today: 10, max_rows_per_day: 1000 })).toBe(
      "You have reached today's limit of 3 imports. Please try again tomorrow.",
    );
  });
  it("falls back to the generic text when details are missing or unreadable", () => {
    expect(importErrorMessage("DAILY_LIMIT", { imports_today: 1 })).toMatch(/today's import limit/);
    expect(importErrorMessage("DAILY_LIMIT", { imports_today: "x", max_per_day: 3, rows_today: 1, max_rows_per_day: 2 })).toMatch(/today's import limit/);
  });
  it("says the file is too large only when the rows sent were within the row limit", () => {
    expect(importErrorMessage("PAYLOAD_INVALID", { max_rows: 1000, sent_rows: 500 })).toMatch(/too large/);
    expect(importErrorMessage("PAYLOAD_INVALID", { max_rows: 1000, sent_rows: 1500 })).toMatch(/at most 1,000/);
  });
});

describe("importErrorMessage", () => {
  it("explains the plan requirement", () => {
    expect(importErrorMessage("NOT_ELIGIBLE")).toMatch(/Pro and Premium/);
  });
  it("shows the numbers behind a cap breach", () => {
    expect(importErrorMessage("CAP_EXCEEDED", { cap: 2000, current: 1900, incoming: 300 })).toBe(
      "This file would take you to 2,200 patients, above your limit of 2,000.",
    );
  });
  it("explains the daily limit and the row limit", () => {
    expect(importErrorMessage("DAILY_LIMIT")).toMatch(/today/i);
    expect(importErrorMessage("PAYLOAD_INVALID", { max_rows: 1000 })).toMatch(/1,000/);
  });
  it("falls back to a generic message", () => {
    expect(importErrorMessage("SOMETHING_ELSE")).toMatch(/try again/i);
  });
  it("never prints NaN for missing or unreadable numbers", () => {
    expect(importErrorMessage("CAP_EXCEEDED")).not.toMatch(/NaN/);
    expect(importErrorMessage("CAP_EXCEEDED", { cap: "abc", current: {}, incoming: undefined })).not.toMatch(/NaN/);
    expect(importErrorMessage("PAYLOAD_INVALID")).toMatch(/1,000/);
  });
  it("accepts numbers sent as strings", () => {
    expect(importErrorMessage("CAP_EXCEEDED", { cap: "2000", current: "1900", incoming: "300" })).toMatch(
      /2,200 patients, above your limit of 2,000/,
    );
  });
});

describe("rowErrorMessage", () => {
  it("has a readable message for every server row code", () => {
    for (const c of ["ROW_INVALID", "NAME", "PHONE", "AGE", "GENDER", "WEIGHT", "EMAIL", "NOTES", "DATE", "DATE_ORDER", "VISITS"]) {
      expect(rowErrorMessage(c).length).toBeGreaterThan(5);
    }
    expect(rowErrorMessage("UNKNOWN")).toBe("Could not be saved.");
  });
});
