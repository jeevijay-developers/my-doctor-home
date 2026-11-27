import { DEFAULT_ACCENT, defaultTemplateConfig } from "./defaults";
import {
  BUILTIN_BLOCK_TYPES, CUSTOM_FIELD_TYPES, INFO_FIELD_KEYS, LIMITS, TEMPLATE_VERSION,
  type Block, type BuiltinBlockType, type CustomBlock, type CustomFieldType, type InfoFieldKey, type TemplateConfig,
} from "./types";

export const BLOCK_ID_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;

export const isHexColor = (v: unknown): v is string => typeof v === "string" && HEX.test(v);

// WCAG contrast of a colour against white paper. The accent colours the doctor's name, headings and
// the QR code, so it must stay readable and scannable when printed.
export function contrastOnWhite(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return 1.05 / (l + 0.05);
}
/** Minimum contrast for the accent (WCAG 3:1, the level for large text and graphics such as the QR code). */
export const MIN_ACCENT_CONTRAST = 3;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const mm = (v: unknown, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(LIMITS.maxMm, Math.max(0, Math.round(v))) : fallback;

export const cleanOptions = (v: unknown): string[] => {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const o of v) {
    const s = text(o, LIMITS.option);
    if (s && !seen.has(s.toLowerCase())) { seen.add(s.toLowerCase()); out.push(s); }
    if (out.length >= LIMITS.options) break;
  }
  return out;
};

export const newBlockId = (taken: Iterable<string> = []): string => {
  const used = new Set(taken);
  for (;;) {
    const id = `cf_${Math.random().toString(36).slice(2, 8).padEnd(6, "x")}`;
    if (!used.has(id)) return id;
  }
};

export const newCustomBlock = (blocks: Block[], fieldType: CustomFieldType = "text", label = ""): CustomBlock => ({
  id: newBlockId(blocks.map((b) => b.id)),
  type: "custom",
  enabled: true,
  label,
  fieldType,
  options: [],
  required: false,
  carryForward: false,
});

// Tolerant read: anything malformed (older rows, hand-edited JSON) falls back to a safe value, so
// rendering a slip can never throw. A value that is not a version-1 object is the built-in default.
export function parseTemplateConfig(value: unknown): TemplateConfig {
  const base = defaultTemplateConfig();
  if (!isObject(value) || value.version !== TEMPLATE_VERSION) return base;

  const header = isObject(value.header) ? value.header : {};
  const footer = isObject(value.footer) ? value.footer : {};

  const blocks: Block[] = [];
  if (Array.isArray(value.blocks)) {
    const ids = new Set<string>();
    const builtins = new Set<string>();
    let customs = 0;
    for (const raw of value.blocks) {
      if (blocks.length >= LIMITS.blocks) break;
      if (!isObject(raw)) continue;
      const enabled = bool(raw.enabled, true);
      const type = raw.type;
      if ((BUILTIN_BLOCK_TYPES as readonly unknown[]).includes(type)) {
        const t = type as BuiltinBlockType;
        if (builtins.has(t)) continue;
        builtins.add(t);
        ids.add(t);
        if (t === "patient_info") {
          const fields = Array.isArray(raw.fields)
            ? Array.from(new Set(raw.fields.filter((f): f is InfoFieldKey => (INFO_FIELD_KEYS as readonly unknown[]).includes(f))))
            : [...INFO_FIELD_KEYS];
          blocks.push({ id: t, type: t, enabled, fields });
        } else {
          blocks.push({ id: t, type: t, enabled });
        }
      } else if (type === "custom") {
        if (customs >= LIMITS.customFields) continue;
        customs++;
        const fieldType = (CUSTOM_FIELD_TYPES as readonly unknown[]).includes(raw.fieldType) ? (raw.fieldType as CustomFieldType) : "text";
        const id = typeof raw.id === "string" && BLOCK_ID_PATTERN.test(raw.id) && !ids.has(raw.id) ? raw.id : newBlockId(ids);
        ids.add(id);
        blocks.push({
          id,
          type: "custom",
          enabled,
          label: text(raw.label, LIMITS.label) || "Untitled field",
          fieldType,
          options: cleanOptions(raw.options),
          required: bool(raw.required, false),
          carryForward: bool(raw.carryForward, false),
        });
      }
    }
  }

  return {
    version: TEMPLATE_VERSION,
    accent: isHexColor(value.accent) ? value.accent : DEFAULT_ACCENT,
    title: text(value.title, LIMITS.title),
    letterhead: value.letterhead === "preprinted" ? "preprinted" : "standard",
    preprintedTopMm: mm(value.preprintedTopMm, base.preprintedTopMm),
    preprintedBottomMm: mm(value.preprintedBottomMm, base.preprintedBottomMm),
    header: {
      qualifications: bool(header.qualifications, true),
      registration: bool(header.registration, true),
      contact: bool(header.contact, true),
    },
    footer: { address: bool(footer.address, true), qr: bool(footer.qr, true) },
    blocks: blocks.length > 0 ? blocks : base.blocks,
  };
}

// What the builder checks before saving. Returns the first problem in plain words, or null.
export function validateTemplateConfig(config: TemplateConfig): string | null {
  if (config.title.length > LIMITS.title) return `The title can be at most ${LIMITS.title} characters.`;
  if (!isHexColor(config.accent)) return "Choose a valid accent colour.";
  if (contrastOnWhite(config.accent) < MIN_ACCENT_CONTRAST) return "That accent colour is too light to read on white paper. Choose a darker one.";
  if (config.blocks.length > LIMITS.blocks) return `A template can have at most ${LIMITS.blocks} sections.`;
  if (!config.blocks.some((b) => b.enabled)) return "Turn on at least one section.";
  const customs = config.blocks.filter((b): b is CustomBlock => b.type === "custom");
  if (customs.length > LIMITS.customFields) return `A template can have at most ${LIMITS.customFields} custom fields.`;
  const seen = new Set<string>();
  for (const c of customs) {
    const label = c.label.trim();
    if (!label) return "Give every custom field a name.";
    if (label.length > LIMITS.label) return `Field names can be at most ${LIMITS.label} characters.`;
    if (seen.has(label.toLowerCase())) return `Two fields are called "${label}". Give them different names.`;
    seen.add(label.toLowerCase());
    if ((c.fieldType === "select" || c.fieldType === "multiselect") && c.options.length < 2) {
      return `Add at least two choices to "${label}".`;
    }
  }
  return null;
}

// Whether a built-in section is switched on. Used so a form never saves a value for a section
// the template has turned off (for example medicines typed before switching to a dental template).
export const blockEnabled = (config: TemplateConfig, type: BuiltinBlockType): boolean =>
  config.blocks.some((b) => b.type === type && b.enabled);

export const showsDiagnosis = (config: TemplateConfig): boolean =>
  config.blocks.some((b) => b.type === "patient_info" && b.enabled && b.fields.includes("diagnosis"));

export function validateTemplateName(name: string): string | null {
  const n = name.trim();
  if (!n) return "Give the template a name.";
  if (n.length > LIMITS.templateName) return `The name can be at most ${LIMITS.templateName} characters.`;
  return null;
}
