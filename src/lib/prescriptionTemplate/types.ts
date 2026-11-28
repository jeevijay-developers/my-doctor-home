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
  complaint: "Complaint",
  symptoms: "Symptoms",
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
  vitals: "Vitals",
  medicines: "Medicines",
  advice: "Advice",
  follow_up: "Follow-up",
  signature: "Signature",
};

// The vitals a template can offer. Weight is optional because the patient box already shows it.
export const VITAL_KEYS = [
  "blood_pressure", "pulse", "temperature", "respiratory_rate", "spo2", "height", "weight", "bmi",
] as const;
export type VitalKey = (typeof VITAL_KEYS)[number];
/** What a template offers until the doctor changes it: the same chips the slip always printed. */
export const DEFAULT_VITAL_FIELDS: readonly VitalKey[] = [
  "blood_pressure", "pulse", "temperature", "respiratory_rate", "spo2", "height", "bmi",
];

// The kinds of advice, and the prescriptions column each one is stored in.
export const ADVICE_KEYS = ["general", "diet", "lifestyle"] as const;
export type AdviceKey = (typeof ADVICE_KEYS)[number];
export const ADVICE_LABELS: Record<AdviceKey, string> = {
  general: "General advice", diet: "Diet advice", lifestyle: "Lifestyle advice",
};
export const ADVICE_COLUMNS: Record<AdviceKey, "advice" | "diet_advice" | "lifestyle_advice"> = {
  general: "advice", diet: "diet_advice", lifestyle: "lifestyle_advice",
};

// Answers to the built-in complaint / symptoms / vitals inputs live in `extra` under reserved keys,
// so a custom field can never collide with them (custom block ids may not start with this prefix).
export const SYS_PREFIX = "sys_";
export const SYS_COMPLAINT = "sys_complaint";
export const SYS_SYMPTOMS = "sys_symptoms";
export const sysVitalKey = (k: VitalKey) => `sys_vital_${k}`;

// Where a custom field is printed (and asked for): its own section, or inside one of these.
export const CUSTOM_PLACEMENTS = ["section", "patient_info", "vitals", "advice"] as const;
export type CustomPlacement = (typeof CUSTOM_PLACEMENTS)[number];
export const PLACEMENT_LABELS: Record<CustomPlacement, string> = {
  section: "Its own section",
  patient_info: "In the patient details box",
  vitals: "In the vitals",
  advice: "In the advice",
};
/** The field types that read well in each place (a tooth chart does not fit in a row of the patient box). */
export const PLACEMENT_FIELD_TYPES: Record<CustomPlacement, readonly CustomFieldType[]> = {
  section: CUSTOM_FIELD_TYPES,
  patient_info: ["text", "number", "select", "checkbox", "date"],
  vitals: ["text", "number", "select"],
  advice: ["text", "textarea", "select", "multiselect"],
};

export type PatientInfoBlock = { id: string; type: "patient_info"; enabled: boolean; fields: InfoFieldKey[] };
export type VitalsBlock = { id: string; type: "vitals"; enabled: boolean; fields: VitalKey[] };
export type AdviceBlock = { id: string; type: "advice"; enabled: boolean; fields: AdviceKey[] };
export type SimpleBlock = { id: string; type: "medicines" | "follow_up" | "signature"; enabled: boolean };
export type CustomBlock = {
  id: string;
  type: "custom";
  enabled: boolean;
  label: string;
  fieldType: CustomFieldType;
  options: string[];
  required: boolean;
  /** Pre-fill from the patient's last prescription (histories, allergies: things that rarely change). */
  carryForward: boolean;
  /** Where it is printed and asked for: its own section, or inside a built-in one. */
  placement: CustomPlacement;
};
export type Block = PatientInfoBlock | VitalsBlock | AdviceBlock | SimpleBlock | CustomBlock;

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
