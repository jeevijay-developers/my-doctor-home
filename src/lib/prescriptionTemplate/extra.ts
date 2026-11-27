import { parseToothMap } from "./teeth";
import {
  LIMITS, isCustomBlock,
  type CustomBlock, type ExtraValue, type ExtraValues, type TemplateConfig,
} from "./types";

export const PAIN_LABELS = ["No pain", "Mild", "Moderate", "Severe", "Very severe", "Worst possible"] as const;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

// prescriptions.extra is Json: narrow it to ExtraValues, dropping anything of the wrong shape.
export function parseExtra(value: unknown): ExtraValues {
  if (!isObject(value)) return {};
  const out: ExtraValues = {};
  for (const [key, v] of Object.entries(value)) {
    if (typeof v === "string") out[key] = v.slice(0, LIMITS.textValue);
    else if (typeof v === "number" && Number.isFinite(v)) out[key] = v;
    else if (typeof v === "boolean") out[key] = v;
    else if (Array.isArray(v)) out[key] = v.filter((s): s is string => typeof s === "string").slice(0, LIMITS.options);
    else if (isObject(v)) {
      const teeth = parseToothMap(v);
      if (Object.keys(teeth).length > 0) out[key] = teeth;
    }
  }
  return out;
}

export function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (isObject(v)) return Object.keys(v).length === 0;
  return false; // numbers (0 = "no pain") and booleans (false = "No") are real answers
}

// Coerces one value to what its field type stores; undefined = nothing to store.
function coerce(block: CustomBlock, v: unknown): ExtraValue | undefined {
  switch (block.fieldType) {
    case "text": {
      const s = typeof v === "string" ? v.trim().slice(0, 200) : "";
      return s || undefined;
    }
    case "textarea": {
      const s = typeof v === "string" ? v.trim().slice(0, LIMITS.textValue) : "";
      return s || undefined;
    }
    case "date": {
      return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
    }
    case "select": {
      return typeof v === "string" && block.options.includes(v) ? v : undefined;
    }
    case "multiselect": {
      const list = Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && block.options.includes(s)) : [];
      return list.length > 0 ? Array.from(new Set(list)) : undefined;
    }
    case "number": {
      const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
      return Number.isFinite(n) ? n : undefined;
    }
    case "checkbox":
      return typeof v === "boolean" ? v : undefined;
    case "pain_scale":
      return typeof v === "number" && Number.isInteger(v) && v >= 0 && v < PAIN_LABELS.length ? v : undefined;
    case "tooth_chart": {
      const teeth = parseToothMap(v);
      return Object.keys(teeth).length > 0 ? teeth : undefined;
    }
  }
}

// What gets saved: only the enabled custom blocks of the template in use, each coerced to its type,
// with empty answers left out. Values of removed or switched-off fields never reach the database.
export function cleanExtra(config: TemplateConfig, extra: Record<string, unknown>): ExtraValues {
  const out: ExtraValues = {};
  for (const b of config.blocks) {
    if (!isCustomBlock(b) || !b.enabled) continue;
    const v = coerce(b, extra[b.id]);
    if (v !== undefined) out[b.id] = v;
  }
  return out;
}

// First problem with the answers (required fields, numbers), in plain words, or null.
export function validateExtra(config: TemplateConfig, extra: Record<string, unknown>): string | null {
  for (const b of config.blocks) {
    if (!isCustomBlock(b) || !b.enabled) continue;
    const raw = extra[b.id];
    if (b.fieldType === "number" && typeof raw === "string" && raw.trim() !== "" && !Number.isFinite(Number(raw))) {
      return `${b.label} must be a number.`;
    }
    if (b.required && coerce(b, raw) === undefined) return `${b.label} is required.`;
  }
  return null;
}

// Plain-text form of a value for rows that are not graphical (tooth chart / pain scale have views).
export function formatExtraValue(block: CustomBlock, v: unknown): string {
  if (block.fieldType === "checkbox") return v === true ? "Yes" : "No";
  if (Array.isArray(v)) return v.join(", ");
  return v === undefined || v === null ? "" : String(v);
}

// Example answers for the builder's live preview.
export function sampleValue(block: CustomBlock): ExtraValue {
  switch (block.fieldType) {
    case "text": return "Sample text";
    case "textarea": return "Sample notes about the patient.\nA second line.";
    case "number": return 12;
    case "select": return block.options[0] ?? "Option";
    case "multiselect": return block.options.slice(0, 2);
    case "checkbox": return true;
    case "date": return "2026-11-27";
    case "pain_scale": return 3;
    case "tooth_chart": return { "16": "decayed", "26": "restored", "36": "missing", "46": "root_stump" };
  }
}

// Answers to copy from the patient's previous prescription into a new one: only fields marked
// "carry forward", only when the new form has no answer yet. A field is matched by id first (templates
// made from the same preset share ids), then by the same name and type in the earlier layout.
export function carryForwardValues(
  config: TemplateConfig,
  current: Record<string, unknown>,
  previousConfig: TemplateConfig,
  previousExtra: unknown,
): ExtraValues {
  const prev = parseExtra(previousExtra);
  const out: ExtraValues = {};
  for (const b of config.blocks) {
    if (!isCustomBlock(b) || !b.enabled || !b.carryForward || !isEmptyValue(current[b.id])) continue;
    let value: unknown = prev[b.id];
    if (isEmptyValue(value)) {
      const same = previousConfig.blocks.find(
        (p): p is CustomBlock => isCustomBlock(p) && p.fieldType === b.fieldType && p.label.trim().toLowerCase() === b.label.trim().toLowerCase(),
      );
      value = same ? prev[same.id] : undefined;
    }
    const v = isEmptyValue(value) ? undefined : coerce(b, value);
    if (v !== undefined) out[b.id] = v;
  }
  return out;
}

export const hasCarryForward = (config: TemplateConfig) =>
  config.blocks.some((b) => isCustomBlock(b) && b.enabled && b.carryForward);

