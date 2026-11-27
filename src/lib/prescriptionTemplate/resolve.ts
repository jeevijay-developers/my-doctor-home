import { parseTemplateConfig } from "./config";
import type { TemplateConfig } from "./types";

export type PrescriptionTemplate = {
  id: string;
  doctor_id: string;
  /** null = the whole clinic; otherwise that doctor's own template. */
  practitioner_id: string | null;
  name: string;
  preset: string | null;
  config: TemplateConfig;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export function parseTemplateRow(row: unknown): PrescriptionTemplate | null {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.doctor_id !== "string" || typeof r.name !== "string") return null;
  return {
    id: r.id,
    doctor_id: r.doctor_id,
    practitioner_id: typeof r.practitioner_id === "string" ? r.practitioner_id : null,
    name: r.name,
    preset: typeof r.preset === "string" ? r.preset : null,
    config: parseTemplateConfig(r.config),
    is_default: r.is_default === true,
    created_at: typeof r.created_at === "string" ? r.created_at : "",
    updated_at: typeof r.updated_at === "string" ? r.updated_at : "",
  };
}

// The template a new prescription starts with: the prescribing doctor's own default, else the
// clinic's default, else null (the built-in standard slip).
export function pickDefaultTemplate(
  templates: PrescriptionTemplate[],
  practitionerId: string | null | undefined,
): PrescriptionTemplate | null {
  const own = practitionerId ? templates.find((t) => t.is_default && t.practitioner_id === practitionerId) : undefined;
  return own ?? templates.find((t) => t.is_default && t.practitioner_id === null) ?? null;
}

// Templates a doctor can choose from when issuing a prescription: the clinic's and their own.
export function templatesForDoctor(templates: PrescriptionTemplate[], practitionerId: string | null | undefined) {
  return templates.filter((t) => t.practitioner_id === null || t.practitioner_id === practitionerId);
}
