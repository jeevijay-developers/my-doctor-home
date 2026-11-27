import { describe, it, expect } from "vitest";
import { carryForwardValues, cleanExtra, formatExtraValue, hasCarryForward, isEmptyValue, parseExtra, validateExtra } from "./extra";
import { newCustomBlock } from "./config";
import { defaultTemplateConfig } from "./defaults";
import { parseToothMap } from "./teeth";
import type { CustomBlock, TemplateConfig } from "./types";

const withFields = (...fields: Array<Partial<CustomBlock> & Pick<CustomBlock, "id" | "label" | "fieldType">>): TemplateConfig => {
  const c = defaultTemplateConfig();
  for (const f of fields) c.blocks.push({ type: "custom", enabled: true, options: [], required: false, carryForward: false, ...f });
  return c;
};

describe("parseToothMap / parseExtra", () => {
  it("keeps only real FDI teeth with a known status", () => {
    expect(parseToothMap({ "16": "decayed", "99": "decayed", "26": "nonsense", "11": 5 })).toEqual({ "16": "decayed" });
    expect(parseToothMap(null)).toEqual({});
    expect(parseToothMap([])).toEqual({});
  });

  it("narrows stored JSON to safe values", () => {
    const out = parseExtra({ a: "x", b: 3, c: true, d: ["p", 4, "q"], e: { "16": "missing", "00": "x" }, f: {}, g: null });
    expect(out).toEqual({ a: "x", b: 3, c: true, d: ["p", "q"], e: { "16": "missing" } });
    expect(parseExtra("nope")).toEqual({});
  });
});

describe("isEmptyValue", () => {
  it("treats 0 and false as real answers, blanks as empty", () => {
    expect(isEmptyValue("")).toBe(true);
    expect(isEmptyValue("  ")).toBe(true);
    expect(isEmptyValue([])).toBe(true);
    expect(isEmptyValue({})).toBe(true);
    expect(isEmptyValue(undefined)).toBe(true);
    expect(isEmptyValue(0)).toBe(false);
    expect(isEmptyValue(false)).toBe(false);
    expect(isEmptyValue("x")).toBe(false);
  });
});

describe("cleanExtra", () => {
  const cfg = withFields(
    { id: "cf_t", label: "Text", fieldType: "text" },
    { id: "cf_n", label: "Num", fieldType: "number" },
    { id: "cf_s", label: "Sel", fieldType: "select", options: ["A", "B"] },
    { id: "cf_m", label: "Multi", fieldType: "multiselect", options: ["A", "B", "C"] },
    { id: "cf_c", label: "Check", fieldType: "checkbox" },
    { id: "cf_p", label: "Pain", fieldType: "pain_scale" },
    { id: "cf_o", label: "Teeth", fieldType: "tooth_chart" },
    { id: "cf_off", label: "Off", fieldType: "text", enabled: false },
  );

  it("coerces each answer to its type and drops empties, strangers and switched-off fields", () => {
    const out = cleanExtra(cfg, {
      cf_t: "  hello ", cf_n: "12.5", cf_s: "Z", cf_m: ["A", "Z", "A", "C"], cf_c: false, cf_p: 0,
      cf_o: { "16": "decayed", "xx": "decayed" }, cf_off: "secret", cf_ghost: "nope",
    });
    expect(out).toEqual({ cf_t: "hello", cf_n: 12.5, cf_m: ["A", "C"], cf_c: false, cf_p: 0, cf_o: { "16": "decayed" } });
  });

  it("leaves out blank, non-numeric and out-of-range answers", () => {
    expect(cleanExtra(cfg, { cf_t: "   ", cf_n: "abc", cf_p: 9, cf_o: {}, cf_m: [] })).toEqual({});
  });
});

describe("validateExtra", () => {
  it("requires required fields and valid numbers", () => {
    const cfg = withFields(
      { id: "cf_r", label: "OPD No.", fieldType: "text", required: true },
      { id: "cf_n", label: "Count", fieldType: "number" },
    );
    expect(validateExtra(cfg, {})).toBe("OPD No. is required.");
    expect(validateExtra(cfg, { cf_r: "  " })).toBe("OPD No. is required.");
    expect(validateExtra(cfg, { cf_r: "12", cf_n: "x1" })).toBe("Count must be a number.");
    expect(validateExtra(cfg, { cf_r: "12", cf_n: "4" })).toBeNull();
  });

  it("a required checkbox is satisfied by an explicit No", () => {
    const cfg = withFields({ id: "cf_c", label: "MLC", fieldType: "checkbox", required: true });
    expect(validateExtra(cfg, {})).toBe("MLC is required.");
    expect(validateExtra(cfg, { cf_c: false })).toBeNull();
  });

  it("ignores required fields that are switched off", () => {
    const cfg = withFields({ id: "cf_r", label: "Hidden", fieldType: "text", required: true, enabled: false });
    expect(validateExtra(cfg, {})).toBeNull();
  });
});

describe("formatExtraValue", () => {
  it("prints yes/no, lists and plain values", () => {
    const check = newCustomBlock([], "checkbox", "MLC");
    expect(formatExtraValue(check, true)).toBe("Yes");
    expect(formatExtraValue(check, false)).toBe("No");
    expect(formatExtraValue(newCustomBlock([], "multiselect", "X"), ["A", "B"])).toBe("A, B");
    expect(formatExtraValue(newCustomBlock([], "number", "N"), 12)).toBe("12");
  });
});

describe("carryForwardValues", () => {
  const cfg = withFields(
    { id: "cf_hist", label: "Medical history", fieldType: "textarea", carryForward: true },
    { id: "cf_all", label: "Allergies", fieldType: "text", carryForward: true },
    { id: "cf_opd", label: "OPD No.", fieldType: "text" },
  );

  it("copies only carry-forward fields that are still empty, matched by id", () => {
    const out = carryForwardValues(cfg, { cf_all: "Penicillin (typed today)" }, cfg, { cf_hist: "Diabetic", cf_all: "None", cf_opd: "99" });
    expect(out).toEqual({ cf_hist: "Diabetic" });
  });

  it("falls back to a field with the same name and type in the earlier layout", () => {
    const older = withFields({ id: "cf_old", label: "  allergies ", fieldType: "text" }, { id: "cf_x", label: "Medical history", fieldType: "number" });
    const out = carryForwardValues(cfg, {}, older, { cf_old: "Sulpha", cf_x: 5 });
    expect(out).toEqual({ cf_all: "Sulpha" }); // a same-named field of another type is not reused
  });

  it("returns nothing for a template without carry-forward fields or an earlier prescription without answers", () => {
    expect(carryForwardValues(defaultTemplateConfig(), {}, cfg, { cf_hist: "x" })).toEqual({});
    expect(carryForwardValues(cfg, {}, cfg, null)).toEqual({});
    expect(hasCarryForward(cfg)).toBe(true);
    expect(hasCarryForward(defaultTemplateConfig())).toBe(false);
  });
});
