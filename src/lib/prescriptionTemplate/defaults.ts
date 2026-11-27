import type { CustomBlock, CustomFieldType, TemplateConfig } from "./types";
import { INFO_FIELD_KEYS, TEMPLATE_VERSION } from "./types";

export const DEFAULT_ACCENT = "#1d4ed8";

// FROZEN CONTRACT: this reproduces the slip as it was before templates existed. A prescription
// without a snapshot renders with it, so changing it would silently change old prescriptions.
export const defaultTemplateConfig = (): TemplateConfig => ({
  version: TEMPLATE_VERSION,
  accent: DEFAULT_ACCENT,
  title: "",
  letterhead: "standard",
  preprintedTopMm: 45,
  preprintedBottomMm: 25,
  header: { qualifications: true, registration: true, contact: true },
  footer: { address: true, qr: true },
  blocks: [
    { id: "patient_info", type: "patient_info", enabled: true, fields: [...INFO_FIELD_KEYS] },
    { id: "vitals", type: "vitals", enabled: true },
    { id: "medicines", type: "medicines", enabled: true },
    { id: "advice", type: "advice", enabled: true },
    { id: "follow_up", type: "follow_up", enabled: true },
    { id: "signature", type: "signature", enabled: true },
  ],
});

const custom = (
  id: string,
  label: string,
  fieldType: CustomFieldType,
  extra: Partial<Pick<CustomBlock, "options" | "required">> = {},
): CustomBlock => ({ id, type: "custom", enabled: true, label, fieldType, options: [], required: false, ...extra });

// A dental case sheet: OPD number, MLC, histories, tooth chart, pain scale, investigations, plan.
const dentalTemplateConfig = (): TemplateConfig => {
  const base = defaultTemplateConfig();
  return {
    ...base,
    title: "OPD CARD",
    blocks: [
      { id: "patient_info", type: "patient_info", enabled: true, fields: ["patient_name", "age", "gender", "diagnosis", "date", "rx_id"] },
      custom("cf_opd_no", "OPD No.", "text"),
      custom("cf_mlc", "MLC", "select", { options: ["No", "Yes"] }),
      custom("cf_complaint", "Chief complaint", "textarea"),
      custom("cf_history", "Past medical / dental / drug history", "textarea"),
      custom("cf_personal", "Personal history", "text"),
      custom("cf_allergies", "Allergies", "text"),
      custom("cf_teeth", "Clinical findings", "tooth_chart"),
      custom("cf_extra_oral", "Extra-oral & soft tissue examination", "textarea"),
      custom("cf_pain", "Pain scale", "pain_scale"),
      custom("cf_investigations", "Investigations advised", "multiselect", {
        options: ["IOPAR", "OPG", "RVG", "CBCT", "Haematology", "Cytology / Biopsy", "Advanced imaging"],
      }),
      custom("cf_plan", "Treatment plan", "textarea"),
      custom("cf_referrals", "Referrals", "textarea"),
      { id: "vitals", type: "vitals", enabled: false },
      { id: "medicines", type: "medicines", enabled: true },
      { id: "advice", type: "advice", enabled: true },
      { id: "follow_up", type: "follow_up", enabled: true },
      { id: "signature", type: "signature", enabled: true },
    ],
  };
};

export type TemplatePresetKey = "general" | "dental";

export const TEMPLATE_PRESETS: ReadonlyArray<{
  key: TemplatePresetKey;
  label: string;
  description: string;
  build: () => TemplateConfig;
}> = [
  { key: "general", label: "General", description: "Patient details, medicines, advice and follow-up.", build: defaultTemplateConfig },
  {
    key: "dental",
    label: "Dental case sheet",
    description: "OPD number, histories, tooth chart, pain scale, investigations and treatment plan.",
    build: dentalTemplateConfig,
  },
];

export const presetLabel = (key: string | null | undefined) => TEMPLATE_PRESETS.find((p) => p.key === key)?.label ?? null;
