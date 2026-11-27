// Prescription templates: the shape a doctor edits in the builder, stores in
// prescription_templates.config and snapshots onto each prescription.
// The same limits are enforced in SQL by prescription_template_config_valid()
// (supabase/migrations/20261127190000_prescription_templates.sql): keep both in sync.

export const TEMPLATE_VERSION = 1 as const;

export const LIMITS = {
  blocks: 40,
  customFields: 30,
  label: 60,
  options: 20,
  option: 40,
  title: 40,
  templateName: 60,
  templatesPerClinic: 20,
  textValue: 2000,
  maxMm: 80,
} as const;

// Rows the patient box can show. Left column first, then the right column (date and ids).
export const INFO_FIELD_KEYS = [
  "patient_name", "age", "gender", "weight", "diagnosis", "complaint", "symptoms",
  "date", "rx_id", "patient_id",
] as const;
export type InfoFieldKey = (typeof INFO_FIELD_KEYS)[number];

export const RIGHT_INFO_FIELDS: readonly InfoFieldKey[] = ["date", "rx_id", "patient_id"];

export const INFO_FIELD_LABELS: Record<InfoFieldKey, string> = {
  patient_name: "Patient name",
  age: "Age",
  gender: "Gender",
  weight: "Weight",
  diagnosis: "Diagnosis",
  complaint: "Complaint (from visit)",
  symptoms: "Symptoms (from visit)",
  date: "Date",
  rx_id: "Prescription ID",
  patient_id: "Patient ID",
};

export const CUSTOM_FIELD_TYPES = [
  "text", "textarea", "number", "select", "multiselect", "checkbox", "date", "tooth_chart", "pain_scale",
] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: "Short text",
  textarea: "Long text",
  number: "Number",
  select: "Choose one",
  multiselect: "Choose several",
  checkbox: "Yes / No",
  date: "Date",
  tooth_chart: "Tooth chart",
  pain_scale: "Pain scale",
};

export const BUILTIN_BLOCK_TYPES = ["patient_info", "vitals", "medicines", "advice", "follow_up", "signature"] as const;
export type BuiltinBlockType = (typeof BUILTIN_BLOCK_TYPES)[number];

export const BUILTIN_BLOCK_LABELS: Record<BuiltinBlockType, string> = {
  patient_info: "Patient details box",
  vitals: "Vitals (from the visit)",
  medicines: "Medicines",
  advice: "Advice (general, diet, lifestyle)",
  follow_up: "Follow-up",
  signature: "Signature",
};

export type PatientInfoBlock = { id: string; type: "patient_info"; enabled: boolean; fields: InfoFieldKey[] };
export type SimpleBlock = { id: string; type: Exclude<BuiltinBlockType, "patient_info">; enabled: boolean };
export type CustomBlock = {
  id: string;
  type: "custom";
  enabled: boolean;
  label: string;
  fieldType: CustomFieldType;
  options: string[];
  required: boolean;
};
export type Block = PatientInfoBlock | SimpleBlock | CustomBlock;

export type Letterhead = "standard" | "preprinted";

export type TemplateConfig = {
  version: typeof TEMPLATE_VERSION;
  accent: string; // #rrggbb
  title: string; // optional heading under the doctor header, e.g. "OPD CARD"
  letterhead: Letterhead;
  preprintedTopMm: number; // blank space left for a pre-printed header
  preprintedBottomMm: number; // blank space left for a pre-printed footer
  header: { qualifications: boolean; registration: boolean; contact: boolean };
  footer: { address: boolean; qr: boolean };
  blocks: Block[];
};

// Values of custom blocks, keyed by block id. A tooth chart is { "16": "decayed" }.
export type ToothStatus = "decayed" | "restored" | "missing" | "root_stump" | "mobile" | "fractured" | "prosthesis";
export type ToothMap = Record<string, ToothStatus>;
export type ExtraValue = string | number | boolean | string[] | ToothMap;
export type ExtraValues = Record<string, ExtraValue>;

export const isCustomBlock = (b: Block): b is CustomBlock => b.type === "custom";
