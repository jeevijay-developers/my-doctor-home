import { describe, expect, it } from "vitest";
import { MAX_IMPORT_ROWS, PATIENT_EXPORT_HEADERS, cleanCell, parseCsv, parsePatientCsv, patientImportTemplate, patientKey, patientsToCsv, splitDuplicates } from "./patientCsv";

describe("parseCsv", () => {
  it("splits plain rows and cells", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("handles quoted commas, escaped quotes and newlines inside quotes", () => {
    expect(parseCsv('Name,Notes\n"Kumar, Ravi","said ""hi""\nsecond line"\n')).toEqual([
      ["Name", "Notes"],
      ["Kumar, Ravi", 'said "hi"\nsecond line'],
    ]);
  });

  it("handles CRLF line endings and a BOM", () => {
    expect(parseCsv("﻿a,b\r\n1,2\r\n")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("keeps empty cells and drops fully blank lines", () => {
    expect(parseCsv("a,b,c\n1,,3\n\n,,\n4,5,6")).toEqual([["a", "b", "c"], ["1", "", "3"], ["4", "5", "6"]]);
  });

  it("returns nothing for an empty file", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("\n\n")).toEqual([]);
  });
});

describe("cleanCell", () => {
  it("trims whitespace", () => {
    expect(cleanCell("  Ravi  ")).toBe("Ravi");
  });

  it("unwraps the text-forcing =\"...\" form used for phone numbers", () => {
    expect(cleanCell('="9876543210"')).toBe("9876543210");
  });

  it("removes the formula guard the exporter adds, but keeps ordinary apostrophes", () => {
    expect(cleanCell("'=HYPERLINK(1)")).toBe("=HYPERLINK(1)");
    expect(cleanCell("'Tis the season")).toBe("'Tis the season");
  });
});

const HEADER = "Name,Phone,Email,Age,Gender,Weight (kg),Notes";

describe("parsePatientCsv", () => {
  it("reads a valid file into normalised rows", () => {
    const r = parsePatientCsv(`${HEADER}\nRavi Kumar,9876543210,ravi@x.com,40,Male,72.5,Diabetic\nMeena,+91 98765 43211,,29,female,,`);
    expect(r.fileError).toBeNull();
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      { line: 2, name: "Ravi Kumar", phone: "9876543210", email: "ravi@x.com", age: 40, gender: "male", weight: 72.5, notes: "Diabetic" },
      { line: 3, name: "Meena", phone: "9876543211", email: null, age: 29, gender: "female", weight: null, notes: null },
    ]);
  });

  it("accepts common header spellings in any order and ignores unknown or system columns", () => {
    const r = parsePatientCsv("Sex,mobile,PATIENT NAME,Age,Weight,Total Visits,Colour\nM,9876543210,Asha,31,60,9,blue");
    expect(r.fileError).toBeNull();
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ name: "Asha", phone: "9876543210", age: 31, gender: "male", weight: 60 });
  });

  it("names the required columns that are missing", () => {
    const r = parsePatientCsv("Name,Phone\nRavi,9876543210");
    expect(r.fileError).toBe("Missing required column(s): Age, Gender");
    expect(r.rows).toEqual([]);
  });

  it("reports an empty file and a header-only file", () => {
    expect(parsePatientCsv("").fileError).toMatch(/empty/i);
    expect(parsePatientCsv(HEADER).fileError).toMatch(/no patient rows/i);
  });

  it("reports every problem of a row together, with the file line number", () => {
    const r = parsePatientCsv(`${HEADER}\nRavi,9876543210,,40,male,,\n,12345,bad-email,200,robot,9999,`);
    expect(r.rows).toHaveLength(1);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].line).toBe(3);
    expect(r.errors[0].messages).toEqual(expect.arrayContaining([
      "Patient name is required",
      expect.stringMatching(/10-digit Indian mobile/),
      expect.stringMatching(/valid age/i),
      expect.stringMatching(/Male, Female or Other/),
      expect.stringMatching(/kg/),
      "Enter a valid email address",
    ]));
  });

  it("explains a phone number Excel turned into scientific notation", () => {
    const r = parsePatientCsv(`${HEADER}\nRavi,9.87654E+09,,40,male,,`);
    expect(r.errors[0].messages[0]).toMatch(/text/i);
  });

  it("accepts units on age and weight and any case on gender", () => {
    const r = parsePatientCsv(`${HEADER}\nRavi,9876543210,,34 years,FEMALE,62.5 kg,\nMeena,9876543211,,5 yrs,o,,`);
    expect(r.errors).toEqual([]);
    expect(r.rows.map((x) => [x.age, x.gender, x.weight])).toEqual([[34, "female", 62.5], [5, "other", null]]);
  });

  it("skips blank rows without reporting them", () => {
    const r = parsePatientCsv(`${HEADER}\n\n,,,,,,\nRavi,9876543210,,40,male,,`);
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(1);
  });

  it("refuses a file with too many rows", () => {
    const body = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `P${i} Name,98765${String(i).padStart(5, "0")},,30,male,,`).join("\n");
    expect(parsePatientCsv(`${HEADER}\n${body}`).fileError).toMatch(/1000/);
  });

  it("rejects notes that are too long", () => {
    const r = parsePatientCsv(`${HEADER}\nRavi,9876543210,,40,male,,${"x".repeat(2001)}`);
    expect(r.errors[0].messages).toEqual([expect.stringMatching(/Notes/)]);
  });
});

describe("splitDuplicates", () => {
  const row = (line: number, name: string, phone: string) => ({ line, name, phone, email: null, age: 30, gender: "male" as const, weight: null, notes: null });

  it("builds the same key as the database unique index (phone + lower-cased trimmed name)", () => {
    expect(patientKey("  Ravi KUMAR ", "9876543210")).toBe("9876543210|ravi kumar");
  });

  it("separates patients that already exist and repeats inside the file", () => {
    const rows = [row(2, "Ravi Kumar", "9876543210"), row(3, "ravi kumar", "9876543210"), row(4, "Meena", "9876543211"), row(5, "Asha", "9876543212")];
    const { fresh, duplicates } = splitDuplicates(rows, new Set([patientKey("Asha", "9876543212")]));
    expect(fresh.map((r) => r.line)).toEqual([2, 4]);
    expect(duplicates.map((r) => r.line)).toEqual([3, 5]);
  });
});

describe("line numbers", () => {
  it("count real file lines even when blank lines are skipped", () => {
    const r = parsePatientCsv(`${HEADER}\n\nRavi,9876543210,,40,male,,\n\n\nMeena,12345,,29,female,,`);
    expect(r.rows[0].line).toBe(3);
    expect(r.errors[0].line).toBe(6);
  });
});

type ExportRow = Parameters<typeof patientsToCsv>[0][number];
const exportRow = (over: Partial<ExportRow> = {}): ExportRow => ({
  name: "Ravi Kumar", phone: "9876543210", email: "ravi@x.com", age: 40, gender: "male", weight: 72.5,
  first_visit: "2026-09-01", last_visit: "2026-10-20", total_visits: 3, notes: "Diabetic", ...over,
});

describe("patientsToCsv", () => {
  it("writes the header with every patient-form field including weight, then the system columns", () => {
    expect(PATIENT_EXPORT_HEADERS.join(",")).toBe("Name,Phone,Email,Age,Gender,Weight (kg),First Visit,Last Visit,Total Visits,Notes");
    const csv = patientsToCsv([exportRow()]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.split("\n")[0]).toBe("\ufeffName,Phone,Email,Age,Gender,Weight (kg),First Visit,Last Visit,Total Visits,Notes");
  });

  it("writes one row per patient with the phone as text, dates as DD/MM/YYYY and blanks for missing values", () => {
    const lines = patientsToCsv([exportRow(), exportRow({ name: "Meena", phone: "9876543211", email: null, age: null, gender: null, weight: null, first_visit: null, last_visit: null, total_visits: 0, notes: null })]).split("\n");
    expect(lines[1]).toBe('Ravi Kumar,="9876543210",ravi@x.com,40,male,72.5,="01/09/2026",="20/10/2026",3,Diabetic');
    expect(lines[2]).toBe('Meena,="9876543211",,,,,,,0,');
  });

  it("neutralises spreadsheet formulas in names and notes", () => {
    const csv = patientsToCsv([exportRow({ name: '=HYPERLINK("http://evil")', notes: "@cmd" })]);
    expect(csv).not.toMatch(/,=HYPERLINK|^=HYPERLINK|\n=HYPERLINK/);
    expect(csv).toContain("'@cmd");
  });
});

describe("export -> import round trip", () => {
  it("re-imports an export without loss, including commas, quotes, newlines and formula-looking text", () => {
    const original = [
      exportRow(),
      exportRow({ name: "Kumar, Meena", phone: "9876543211", email: null, age: 5, gender: "female", weight: null, notes: 'said "hi"\nsecond line' }),
      exportRow({ name: "=SUM(A1)", phone: "9876543212", age: 0, gender: "other", weight: 3.4, notes: null }),
    ];
    const parsed = parsePatientCsv(patientsToCsv(original));
    expect(parsed.fileError).toBeNull();
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows.map(({ name, phone, email, age, gender, weight, notes }) => ({ name, phone, email, age, gender, weight, notes }))).toEqual(
      original.map((o) => ({ name: o.name, phone: o.phone, email: o.email, age: o.age, gender: o.gender, weight: o.weight, notes: o.notes })),
    );
  });

  it("reports (rather than silently dropping) patients whose age or gender was never recorded", () => {
    const parsed = parsePatientCsv(patientsToCsv([exportRow({ age: null, gender: null })]));
    expect(parsed.rows).toEqual([]);
    expect(parsed.errors[0].messages).toEqual(expect.arrayContaining(["Age is required", "Gender must be Male, Female or Other"]));
  });
});

describe("patientImportTemplate", () => {
  it("is a valid file with the importable columns and two example rows", () => {
    const t = patientImportTemplate();
    expect(t.split("\n")[0]).toBe("\ufeffName,Phone,Email,Age,Gender,Weight (kg),Notes");
    const parsed = parsePatientCsv(t);
    expect(parsed.fileError).toBeNull();
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(2);
  });
});
