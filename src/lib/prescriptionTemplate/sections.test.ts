import { describe, it, expect } from "vitest";
import {
  adviceEnabled, isOffered, newCustomBlock, parseTemplateConfig, placementsFor, showsComplaint, validateTemplateConfig, vitalFields,
} from "./config";
import { TEMPLATE_PRESETS, defaultTemplateConfig } from "./defaults";
import { carryForwardValues, cleanExtra, hasCarryForward, validateExtra } from "./extra";
import { computeBmi, cleanVital, formatVital, vitalError, vitalsForSlip } from "./vitals";
import {
  ADVICE_KEYS, DEFAULT_VITAL_FIELDS, SYS_COMPLAINT, SYS_SYMPTOMS, isCustomBlock, sysVitalKey, type TemplateConfig,
} from "./types";

const withBlocks = (mutate: (c: TemplateConfig) => void) => {
  const c = defaultTemplateConfig();
  mutate(c);
  return c;
};

describe("vitals and advice fields in a template", () => {
  it("the default offers the vitals the slip always printed and all three kinds of advice", () => {
    const d = defaultTemplateConfig();
    expect(vitalFields(d)).toEqual([...DEFAULT_VITAL_FIELDS]);
    expect(vitalFields(d)).not.toContain("weight"); // the patient box already shows weight
    for (const k of ADVICE_KEYS) expect(adviceEnabled(d, k)).toBe(true);
  });

  it("an older snapshot without `fields` still parses to those defaults", () => {
    const cfg = parseTemplateConfig({
      version: 1,
      blocks: [{ id: "vitals", type: "vitals", enabled: true }, { id: "advice", type: "advice", enabled: true }],
    });
    expect(cfg.blocks).toEqual([
      { id: "vitals", type: "vitals", enabled: true, fields: [...DEFAULT_VITAL_FIELDS] },
      { id: "advice", type: "advice", enabled: true, fields: [...ADVICE_KEYS] },
    ]);
  });

  it("keeps only known fields, in the section's own order, and an empty list stays empty", () => {
    const cfg = parseTemplateConfig({
      version: 1,
      blocks: [
        { id: "vitals", type: "vitals", enabled: true, fields: ["spo2", "bogus", "pulse", "pulse"] },
        { id: "advice", type: "advice", enabled: true, fields: [] },
      ],
    });
    expect(cfg.blocks[0]).toMatchObject({ fields: ["pulse", "spo2"] });
    expect(cfg.blocks[1]).toMatchObject({ fields: [] });
    expect(adviceEnabled(cfg, "diet")).toBe(false);
  });

  it("a switched-off section offers nothing", () => {
    const c = withBlocks((x) => {
      x.blocks = x.blocks.map((b) => (b.type === "advice" || b.type === "vitals" ? { ...b, enabled: false } : b));
    });
    expect(vitalFields(c)).toEqual([]);
    expect(adviceEnabled(c, "general")).toBe(false);
  });

  it("complaint and symptoms are offered only when the patient box lists them", () => {
    expect(showsComplaint(defaultTemplateConfig(), "complaint")).toBe(true);
    const c = withBlocks((x) => {
      x.blocks = x.blocks.map((b) => (b.type === "patient_info" ? { ...b, fields: ["patient_name"] } : b));
    });
    expect(showsComplaint(c, "complaint")).toBe(false);
    expect(showsComplaint(c, "symptoms")).toBe(false);
  });
});

describe("placing a custom field inside a section", () => {
  it("a short field can go in the patient box, a vital or the advice; a tooth chart only has its own section", () => {
    expect(placementsFor("text")).toEqual(["section", "patient_info", "vitals", "advice"]);
    expect(placementsFor("checkbox")).toEqual(["section", "patient_info"]);
    expect(placementsFor("textarea")).toEqual(["section", "advice"]);
    expect(placementsFor("tooth_chart")).toEqual(["section"]);
    expect(placementsFor("pain_scale")).toEqual(["section"]);
  });

  it("new fields default to their own section, and a bad placement for the type is ignored", () => {
    expect(newCustomBlock([], "text", "Height").placement).toBe("section");
    expect(newCustomBlock([], "text", "Height", "vitals").placement).toBe("vitals");
    expect(newCustomBlock([], "tooth_chart", "Teeth", "vitals").placement).toBe("section");
  });

  it("is kept when valid and repaired to its own section when it does not fit or is unknown", () => {
    const cfg = parseTemplateConfig({
      version: 1,
      blocks: [
        { id: "cf_a", type: "custom", enabled: true, label: "A", fieldType: "number", placement: "vitals" },
        { id: "cf_b", type: "custom", enabled: true, label: "B", fieldType: "tooth_chart", placement: "patient_info" },
        { id: "cf_c", type: "custom", enabled: true, label: "C", fieldType: "text", placement: "nowhere" },
        { id: "cf_d", type: "custom", enabled: true, label: "D", fieldType: "text" },
      ],
    });
    expect(cfg.blocks.filter(isCustomBlock).map((b) => b.placement)).toEqual(["vitals", "section", "section", "section"]);
  });

  it("the builder refuses a placement that does not fit the field type", () => {
    const c = defaultTemplateConfig();
    const b = newCustomBlock(c.blocks, "tooth_chart", "Teeth");
    b.placement = "patient_info";
    c.blocks.push(b);
    expect(validateTemplateConfig(c)).toMatch(/cannot go/i);
  });

  it("a custom field may not use the reserved sys_ prefix of the built-in answers", () => {
    const cfg = parseTemplateConfig({
      version: 1,
      blocks: [{ id: "sys_complaint", type: "custom", enabled: true, label: "Sneaky", fieldType: "text" }],
    });
    expect(cfg.blocks.filter(isCustomBlock)[0].id).not.toMatch(/^sys_/);
  });

  it("presets stay valid", () => {
    for (const p of TEMPLATE_PRESETS) expect(validateTemplateConfig(p.build())).toBeNull();
  });
});

describe("vitals helpers", () => {
  it("normalises blood pressure and keeps numbers in range", () => {
    expect(cleanVital("blood_pressure", " 120 / 80 ")).toBe("120/80");
    expect(cleanVital("blood_pressure", "12080")).toBeUndefined();
    expect(cleanVital("pulse", "72")).toBe(72);
    expect(cleanVital("pulse", "720")).toBeUndefined();
    expect(cleanVital("temperature", "98.6")).toBe(98.6);
    expect(cleanVital("spo2", "101")).toBeUndefined();
    expect(cleanVital("height", "")).toBeUndefined();
    expect(cleanVital("weight", "abc")).toBeUndefined();
  });

  it("explains a bad entry in plain words and says nothing for an empty one", () => {
    expect(vitalError("blood_pressure", "abc")).toBe("Blood pressure must look like 120/80.");
    expect(vitalError("pulse", "720")).toBe("Pulse must be a number between 20 and 250 bpm.");
    expect(vitalError("pulse", "")).toBeNull();
    expect(vitalError("pulse", undefined)).toBeNull();
    expect(vitalError("pulse", "72")).toBeNull();
  });

  it("computes BMI to one decimal and refuses nonsense", () => {
    expect(computeBmi(170, 70)).toBe(24.2);
    expect(computeBmi(0, 70)).toBeUndefined();
    expect(computeBmi(170, NaN)).toBeUndefined();
  });

  it("formats chips exactly as the slip always did", () => {
    expect(formatVital("blood_pressure", "120/80")).toBe("120/80");
    expect(formatVital("pulse", 72)).toBe("72 bpm");
    expect(formatVital("temperature", 98.6)).toBe("98.6°F");
    expect(formatVital("respiratory_rate", 16)).toBe("16/min");
    expect(formatVital("spo2", 98)).toBe("98%");
    expect(formatVital("height", 170)).toBe("170 cm");
    expect(formatVital("bmi", 24.2)).toBe("24.2");
  });

  it("prints the prescription's own value, falling back to the visit's, in the template's order", () => {
    const out = vitalsForSlip(
      ["blood_pressure", "pulse", "spo2"],
      { [sysVitalKey("pulse")]: 80 },
      { blood_pressure: "110/70", pulse: 60, spo2: null },
    );
    expect(out.map((v) => `${v.label}: ${v.text}`)).toEqual(["BP: 110/70", "Pulse: 80 bpm"]);
  });
});

describe("answers typed for the built-in rows", () => {
  const cfg = defaultTemplateConfig();

  it("keeps complaint, symptoms and the offered vitals, cleaned", () => {
    const out = cleanExtra(cfg, {
      [SYS_COMPLAINT]: "  Fever for 3 days ", [SYS_SYMPTOMS]: "Chills",
      [sysVitalKey("blood_pressure")]: "120 / 80", [sysVitalKey("pulse")]: "72", [sysVitalKey("spo2")]: "250",
      [sysVitalKey("weight")]: "70", // not offered by the default template
    });
    expect(out).toEqual({
      [SYS_COMPLAINT]: "Fever for 3 days", [SYS_SYMPTOMS]: "Chills",
      [sysVitalKey("blood_pressure")]: "120/80", [sysVitalKey("pulse")]: 72,
    });
  });

  it("never stores answers for rows the template does not offer", () => {
    const c = withBlocks((x) => {
      x.blocks = x.blocks.map((b) =>
        b.type === "patient_info" ? { ...b, fields: ["patient_name"] } : b.type === "vitals" ? { ...b, enabled: false } : b);
    });
    expect(cleanExtra(c, { [SYS_COMPLAINT]: "x", [SYS_SYMPTOMS]: "y", [sysVitalKey("pulse")]: 70 })).toEqual({});
  });

  it("works out BMI from height and weight when both are offered and given", () => {
    const c = withBlocks((x) => {
      x.blocks = x.blocks.map((b) => (b.type === "vitals" ? { ...b, fields: ["height", "weight", "bmi"] } : b));
    });
    const out = cleanExtra(c, { [sysVitalKey("height")]: "170", [sysVitalKey("weight")]: "70", [sysVitalKey("bmi")]: "99" });
    expect(out[sysVitalKey("bmi")]).toBe(24.2); // computed, not the typed 99
    expect(cleanExtra(c, { [sysVitalKey("height")]: "170", [sysVitalKey("bmi")]: "22" })[sysVitalKey("bmi")]).toBe(22);
  });

  it("refuses a mistyped vital with a clear message and ignores vitals that are off", () => {
    expect(validateExtra(cfg, { [sysVitalKey("pulse")]: "720" })).toMatch(/Pulse must be a number/);
    expect(validateExtra(cfg, { [sysVitalKey("blood_pressure")]: "abc" })).toMatch(/Blood pressure/);
    expect(validateExtra(cfg, { [sysVitalKey("pulse")]: "72" })).toBeNull();
    const off = withBlocks((x) => { x.blocks = x.blocks.map((b) => (b.type === "vitals" ? { ...b, enabled: false } : b)); });
    expect(validateExtra(off, { [sysVitalKey("pulse")]: "720" })).toBeNull();
  });

  it("refuses a Celsius-looking temperature and an impossible blood pressure", () => {
    expect(cleanVital("temperature", "37.5")).toBeUndefined();
    expect(cleanVital("temperature", "98.6")).toBe(98.6);
    expect(vitalError("temperature", "37.5")).toBe("Temperature must be a number between 80 and 115 °F.");
    expect(cleanVital("blood_pressure", "80/120")).toBeUndefined(); // diastolic above systolic
    expect(cleanVital("blood_pressure", "999/999")).toBeUndefined();
    expect(cleanVital("blood_pressure", "120/80")).toBe("120/80");
  });

  it("a field placed in a switched-off section is not validated, carried forward or saved", () => {
    const c = defaultTemplateConfig();
    const b = newCustomBlock(c.blocks, "number", "Blood sugar", "vitals");
    b.required = true;
    b.carryForward = true;
    c.blocks.push(b);
    c.blocks = c.blocks.map((x) => (x.type === "vitals" ? { ...x, enabled: false } : x));
    expect(validateExtra(c, {})).toBeNull(); // required, but there is no input to fill it
    expect(cleanExtra(c, { [b.id]: 110 })).toEqual({});
    expect(hasCarryForward(c)).toBe(false);
    expect(carryForwardValues(c, {}, c, { [b.id]: 110 })).toEqual({});
    // Switched back on, it is asked for again.
    c.blocks = c.blocks.map((x) => (x.type === "vitals" ? { ...x, enabled: true } : x));
    expect(validateExtra(c, {})).toBe("Blood sugar is required.");
    expect(isOffered(c, b)).toBe(true);
  });

  it("custom fields placed in a section are cleaned like any other field", () => {
    const c = defaultTemplateConfig();
    c.blocks.push(newCustomBlock(c.blocks, "number", "Blood sugar", "vitals"));
    const id = c.blocks.filter(isCustomBlock)[0].id;
    expect(cleanExtra(c, { [id]: "110" })).toEqual({ [id]: 110 });
  });
});
