import { describe, it, expect } from "vitest";
import { blockEnabled, newCustomBlock, parseTemplateConfig, showsDiagnosis, validateTemplateConfig, validateTemplateName } from "./config";
import { DEFAULT_ACCENT, TEMPLATE_PRESETS, defaultTemplateConfig } from "./defaults";
import { INFO_FIELD_KEYS, LIMITS, isCustomBlock, type TemplateConfig } from "./types";

describe("parseTemplateConfig", () => {
  it("falls back to the built-in default for anything that is not a version-1 object", () => {
    for (const bad of [null, undefined, "x", 5, [], {}, { version: 2, blocks: [] }]) {
      expect(parseTemplateConfig(bad)).toEqual(defaultTemplateConfig());
    }
  });

  it("round-trips a valid config unchanged", () => {
    for (const p of TEMPLATE_PRESETS) {
      const cfg = p.build();
      expect(parseTemplateConfig(JSON.parse(JSON.stringify(cfg)))).toEqual(cfg);
    }
  });

  it("the built-in default reproduces today's slip: every section on, every info row, header and footer shown", () => {
    const d = defaultTemplateConfig();
    expect(d.letterhead).toBe("standard");
    expect(d.accent).toBe("#1d4ed8");
    expect(d.title).toBe("");
    expect(d.blocks.map((b) => b.type)).toEqual(["patient_info", "vitals", "medicines", "advice", "follow_up", "signature"]);
    expect(d.blocks.every((b) => b.enabled)).toBe(true);
    const info = d.blocks[0];
    expect(info.type === "patient_info" && info.fields).toEqual([...INFO_FIELD_KEYS]);
    expect(d.header).toEqual({ qualifications: true, registration: true, contact: true });
    expect(d.footer).toEqual({ address: true, qr: true });
  });

  it("drops unknown block types, repeated built-ins and unknown info fields", () => {
    const cfg = parseTemplateConfig({
      version: 1,
      blocks: [
        { id: "patient_info", type: "patient_info", enabled: true, fields: ["patient_name", "bogus", "age", "age"] },
        { id: "x", type: "script", enabled: true },
        { id: "medicines", type: "medicines", enabled: true },
        { id: "medicines", type: "medicines", enabled: false },
      ],
    });
    expect(cfg.blocks).toHaveLength(2);
    expect(cfg.blocks[0]).toMatchObject({ type: "patient_info", fields: ["patient_name", "age"] });
  });

  it("repairs custom fields: bad ids are replaced, labels trimmed, unknown types become text, options cleaned", () => {
    const cfg = parseTemplateConfig({
      version: 1,
      blocks: [
        { id: "Bad Id!", type: "custom", enabled: true, label: "  OPD No.  ", fieldType: "weird" },
        { id: "cf_a", type: "custom", enabled: true, label: "MLC", fieldType: "select", options: [" Yes ", "yes", "", "No", 5] },
        { id: "cf_a", type: "custom", enabled: true, label: "Dup id", fieldType: "text" },
      ],
    });
    const customs = cfg.blocks.filter(isCustomBlock);
    expect(customs).toHaveLength(3);
    expect(customs[0]).toMatchObject({ label: "OPD No.", fieldType: "text" });
    expect(customs[1].options).toEqual(["Yes", "No"]);
    expect(new Set(customs.map((b) => b.id)).size).toBe(3);
    customs.forEach((b) => expect(b.id).toMatch(/^[a-z][a-z0-9_]{0,31}$/));
  });

  it("never lets an accent through that is not #rrggbb, and clamps the letterhead spacing", () => {
    const cfg = parseTemplateConfig({
      version: 1, accent: "red; background:url(x)", letterhead: "preprinted", preprintedTopMm: 9999, preprintedBottomMm: -5,
      blocks: [{ id: "signature", type: "signature", enabled: true }],
    });
    expect(cfg.accent).toBe(DEFAULT_ACCENT);
    expect(cfg.letterhead).toBe("preprinted");
    expect(cfg.preprintedTopMm).toBe(LIMITS.maxMm);
    expect(cfg.preprintedBottomMm).toBe(0);
  });

  it("caps the number of blocks and custom fields", () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ id: `cf_${i}`, type: "custom", enabled: true, label: `F${i}`, fieldType: "text" }));
    const cfg = parseTemplateConfig({ version: 1, blocks: many });
    expect(cfg.blocks.length).toBeLessThanOrEqual(LIMITS.customFields);
  });
});

describe("validateTemplateConfig / validateTemplateName", () => {
  const base = (): TemplateConfig => defaultTemplateConfig();

  it("accepts the default and every preset", () => {
    expect(validateTemplateConfig(base())).toBeNull();
    for (const p of TEMPLATE_PRESETS) expect(validateTemplateConfig(p.build())).toBeNull();
  });

  it("needs at least one section switched on", () => {
    const c = base();
    c.blocks = c.blocks.map((b) => ({ ...b, enabled: false }));
    expect(validateTemplateConfig(c)).toMatch(/at least one section/i);
  });

  it("needs named, uniquely named custom fields, and two or more choices for choice fields", () => {
    const c = base();
    c.blocks.push({ ...newCustomBlock(c.blocks, "text", ""), });
    expect(validateTemplateConfig(c)).toMatch(/name/i);

    const d = base();
    d.blocks.push(newCustomBlock(d.blocks, "text", "OPD"), newCustomBlock(d.blocks, "text", "opd"));
    expect(validateTemplateConfig(d)).toMatch(/different names/i);

    const e = base();
    const sel = newCustomBlock(e.blocks, "select", "MLC");
    sel.options = ["Yes"];
    e.blocks.push(sel);
    expect(validateTemplateConfig(e)).toMatch(/at least two choices/i);
    sel.options = ["Yes", "No"];
    expect(validateTemplateConfig(e)).toBeNull();
  });

  it("rejects an empty or over-long template name", () => {
    expect(validateTemplateName("  ")).toMatch(/name/i);
    expect(validateTemplateName("x".repeat(LIMITS.templateName + 1))).toMatch(/at most/i);
    expect(validateTemplateName("Dental")).toBeNull();
  });
});

describe("section helpers", () => {
  it("blockEnabled / showsDiagnosis follow the template", () => {
    const d = defaultTemplateConfig();
    expect(blockEnabled(d, "medicines")).toBe(true);
    expect(showsDiagnosis(d)).toBe(true);
    const off: TemplateConfig = {
      ...d,
      blocks: d.blocks.map((b) =>
        b.type === "medicines" ? { ...b, enabled: false } : b.type === "patient_info" ? { ...b, fields: b.fields.filter((f) => f !== "diagnosis") } : b),
    };
    expect(blockEnabled(off, "medicines")).toBe(false);
    expect(showsDiagnosis(off)).toBe(false);
  });
});
