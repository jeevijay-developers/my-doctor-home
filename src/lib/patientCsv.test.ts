import { describe, expect, it } from "vitest";
import { MAX_IMPORT_ROWS, PATIENT_EXPORT_HEADERS, cleanCell, parseCsv, parseDateCell, parsePatientCsv, patientImportTemplate, patientKey, patientSinceDate, patientsToCsv, splitDuplicates } from "./patientCsv";

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
const NO_HISTORY = { patient_since: null, first_visit: null, last_visit: null, total_visits: 0 };

describe("parsePatientCsv", () => {
  it("reads a valid file into normalised rows", () => {
    const r = parsePatientCsv(`${HEADER}\nRavi Kumar,9876543210,ravi@x.com,40,Male,72.5,Diabetic\nMeena,+91 98765 43211,,29,female,,`);
    expect(r.fileError).toBeNull();
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      { line: 2, name: "Ravi Kumar", phone: "9876543210", email: "ravi@x.com", age: 40, gender: "male", weight: 72.5, notes: "Diabetic", ...NO_HISTORY },
      { line: 3, name: "Meena", phone: "9876543211", email: null, age: 29, gender: "female", weight: null, notes: null, ...NO_HISTORY },
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
  const row = (line: number, name: string, phone: string) => ({ line, name, phone, email: null, age: 30, gender: "male" as const, weight: null, notes: null, ...NO_HISTORY });

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
    expect(PATIENT_EXPORT_HEADERS.join(",")).toBe("Name,Phone,Email,Age,Gender,Weight (kg),Patient Since,First Visit,Last Visit,Total Visits,Notes");
    const csv = patientsToCsv([exportRow()]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.split("\n")[0]).toBe("\ufeffName,Phone,Email,Age,Gender,Weight (kg),Patient Since,First Visit,Last Visit,Total Visits,Notes");
  });

  it("writes one row per patient with the phone as text, dates as DD/MM/YYYY and blanks for missing values", () => {
    const lines = patientsToCsv([exportRow(), exportRow({ name: "Meena", phone: "9876543211", email: null, age: null, gender: null, weight: null, first_visit: null, last_visit: null, total_visits: 0, notes: null })]).split("\n");
    expect(lines[1]).toBe('Ravi Kumar,="9876543210",ravi@x.com,40,male,72.5,="01/09/2026",="01/09/2026",="20/10/2026",3,Diabetic');
    expect(lines[2]).toBe('Meena,="9876543211",,,,,,,,0,');
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
    expect(t.split("\n")[0]).toBe("\ufeffName,Phone,Email,Age,Gender,Weight (kg),Notes,Patient Since,First Visit,Last Visit,Total Visits");
    const parsed = parsePatientCsv(t);
    expect(parsed.fileError).toBeNull();
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(2);
  });
});


describe("parseDateCell", () => {
  it("reads DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY and YYYY-MM-DD", () => {
    expect(parseDateCell("25/12/2023")).toBe("2023-12-25");
    expect(parseDateCell("5-3-2021")).toBe("2021-03-05");
    expect(parseDateCell("05.03.2021")).toBe("2021-03-05");
    expect(parseDateCell("2021-03-05")).toBe("2021-03-05");
    expect(parseDateCell("=01/09/2026")).toBe("2026-09-01");
  });
  it("rejects dates that do not exist and formats it cannot read", () => {
    for (const bad of ["31/02/2023", "2023-13-01", "12/25/2023", "25/12/23", "1850-01-01", "yesterday", ""]) {
      expect(parseDateCell(bad)).toBeNull();
    }
  });
});

describe("history columns", () => {
  const H = `${HEADER},Patient Since,First Visit,Last Visit,Total Visits`;
  const parse = (cells: string) => parsePatientCsv(`${H}
Ravi,9876543210,,40,male,,,${cells}`);

  it("keeps the dates and visit count from the file", () => {
    const r = parse("15/03/2019,15/03/2019,02/09/2025,14");
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({ patient_since: "2019-03-15", first_visit: "2019-03-15", last_visit: "2025-09-02", total_visits: 14 });
  });

  it("uses First Visit as Patient Since when only that is given, and leaves everything empty when nothing is", () => {
    expect(parse(",10/01/2020,,").rows[0]).toMatchObject({ patient_since: "2020-01-10", first_visit: "2020-01-10", total_visits: 0 });
    expect(parse(",,,").rows[0]).toMatchObject({ patient_since: null, first_visit: null, last_visit: null, total_visits: 0 });
  });

  it("explains each problem with the dates and the visit count", () => {
    expect(parse("31/02/2020,,,").errors[0].messages).toContain("Patient Since must be a real date like 25/12/2023");
    expect(parse(",01/01/2999,,").errors[0].messages).toContain("First Visit cannot be in the future");
    expect(parse(",10/05/2022,01/05/2022,").errors[0].messages).toContain("Last Visit cannot be before First Visit");
    expect(parse("01/06/2022,01/05/2022,,").errors[0].messages).toContain("Patient Since cannot be after First Visit");
    expect(parse(",,,-3").errors[0].messages[0]).toMatch(/Total Visits must be a whole number/);
    expect(parse(",,,2.5").errors[0].messages[0]).toMatch(/Total Visits must be a whole number/);
  });

  it("round-trips the history through an export", () => {
    const parsed = parsePatientCsv(patientsToCsv([exportRow({ patient_since: "2019-03-15", first_visit: "2019-03-15", last_visit: "2025-09-02", total_visits: 14 })]));
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]).toMatchObject({ patient_since: "2019-03-15", first_visit: "2019-03-15", last_visit: "2025-09-02", total_visits: 14 });
  });
});

describe("patientSinceDate", () => {
  it("prefers the stored date, then the first visit, then the day the record was added (clinic time)", () => {
    expect(patientSinceDate({ patient_since: "2019-03-15", first_visit: "2020-01-01", created_at: "2026-11-20T00:00:00Z" })).toBe("2019-03-15");
    expect(patientSinceDate({ first_visit: "2020-01-01", created_at: "2026-11-20T00:00:00Z" })).toBe("2020-01-01");
    expect(patientSinceDate({ created_at: "2026-11-19T20:00:00Z" })).toBe("2026-11-20");
    expect(patientSinceDate({})).toBeNull();
  });
});
