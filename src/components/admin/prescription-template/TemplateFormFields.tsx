import type { ReactNode } from "react";
import { ClipboardList, HeartPulse, Stethoscope } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { computeBmi, cleanVital, VITAL_META } from "@/lib/prescriptionTemplate/vitals";
import {
  ADVICE_COLUMNS, ADVICE_LABELS, SYS_COMPLAINT, SYS_SYMPTOMS, isCustomBlock, sysVitalKey,
  type CustomBlock, type CustomPlacement, type TemplateConfig, type VitalKey,
} from "@/lib/prescriptionTemplate/types";
import CustomFieldInput from "./CustomFieldInput";

// The prescription columns the template's sections write to (patient, date, age, weight are
// handled by PrescriptionPatientFields above this block).
export type TemplateFormValues = {
  diagnosis: string;
  advice: string;
  diet_advice: string;
  lifestyle_advice: string;
  follow_up_date: string;
  follow_up_instructions: string;
};

export const emptyTemplateFormValues = (): TemplateFormValues => ({
  diagnosis: "", advice: "", diet_advice: "", lifestyle_advice: "", follow_up_date: "", follow_up_instructions: "",
});

type Props = {
  config: TemplateConfig;
  idPrefix: string;
  values: TemplateFormValues;
  onChange: (patch: Partial<TemplateFormValues>) => void;
  extra: Record<string, unknown>;
  onExtraChange: (blockId: string, value: unknown) => void;
  /** The medicines editor lives in PrescriptionsPage; it is placed where the template puts Medicines. */
  renderMedicines: () => ReactNode;
};

const asText = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

// The vitals inputs of the template. BMI follows height and weight once both are filled in.
const VitalsInputs = ({
  fields, idPrefix, extra, onExtraChange,
}: { fields: VitalKey[]; idPrefix: string; extra: Record<string, unknown>; onExtraChange: (id: string, v: unknown) => void }) => {
  const bmi = computeBmi(Number(cleanVital("height", extra[sysVitalKey("height")])), Number(cleanVital("weight", extra[sysVitalKey("weight")])));
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {fields.map((k) => {
        const meta = VITAL_META[k];
        const auto = k === "bmi" && bmi !== undefined;
        const id = `${idPrefix}-vital-${k}`;
        return (
          <div key={k} className="space-y-1">
            <Label htmlFor={id} className="text-xs">{meta.label}{meta.unit ? ` (${meta.unit})` : ""}</Label>
            <Input
              id={id} className="h-9" inputMode={k === "blood_pressure" ? "text" : "decimal"} maxLength={7}
              placeholder={meta.placeholder}
              readOnly={auto}
              aria-describedby={auto ? `${id}-note` : undefined}
              value={auto ? String(bmi) : asText(extra[sysVitalKey(k)])}
              onChange={(e) => onExtraChange(sysVitalKey(k), k === "blood_pressure" ? e.target.value.replace(/[^0-9/\s]/g, "") : e.target.value.replace(/[^0-9.]/g, ""))}
            />
            {auto && <p id={`${id}-note`} className="text-[11px] text-muted-foreground">Worked out from height and weight</p>}
          </div>
        );
      })}
    </div>
  );
};

// The inputs of the template's enabled sections, in the template's order, including the custom fields
// placed inside a section. Print-only sections (signature) have no input.
const TemplateFormFields = ({ config, idPrefix, values, onChange, extra, onExtraChange, renderMedicines }: Props) => {
  const placed = (where: CustomPlacement): CustomBlock[] =>
    config.blocks.filter((b): b is CustomBlock => isCustomBlock(b) && b.enabled && b.placement === where);
  const field = (b: CustomBlock) => (
    <CustomFieldInput key={b.id} block={b} idPrefix={idPrefix} value={extra[b.id]} onChange={(v) => onExtraChange(b.id, v)} />
  );

  return (
    <>
      {config.blocks.filter((b) => b.enabled).map((b) => {
        switch (b.type) {
          case "patient_info": {
            const showDiagnosis = b.fields.includes("diagnosis");
            const showComplaint = b.fields.includes("complaint");
            const showSymptoms = b.fields.includes("symptoms");
            const own = placed("patient_info");
            if (!showDiagnosis && !showComplaint && !showSymptoms && own.length === 0) return null;
            return (
              <div key={b.id} className="space-y-4">
                {showDiagnosis && (
                  <div className="space-y-1.5">
                    <Label htmlFor={`${idPrefix}-diagnosis`} className="flex items-center gap-1.5"><Stethoscope className="h-3.5 w-3.5" /> Diagnosis</Label>
                    <Input
                      id={`${idPrefix}-diagnosis`} className="h-10" placeholder="e.g. Acute bronchitis"
                      value={values.diagnosis} onChange={(e) => onChange({ diagnosis: e.target.value })}
                    />
                  </div>
                )}
                {showComplaint && (
                  <div className="space-y-1.5">
                    <Label htmlFor={`${idPrefix}-complaint`}>Complaint</Label>
                    <Input
                      id={`${idPrefix}-complaint`} className="h-10" maxLength={500} placeholder="e.g. Fever for 3 days"
                      value={asText(extra[SYS_COMPLAINT])} onChange={(e) => onExtraChange(SYS_COMPLAINT, e.target.value)}
                    />
                  </div>
                )}
                {showSymptoms && (
                  <div className="space-y-1.5">
                    <Label htmlFor={`${idPrefix}-symptoms`}>Symptoms</Label>
                    <Textarea
                      id={`${idPrefix}-symptoms`} rows={2} maxLength={500}
                      value={asText(extra[SYS_SYMPTOMS])} onChange={(e) => onExtraChange(SYS_SYMPTOMS, e.target.value)}
                    />
                  </div>
                )}
                {own.map(field)}
              </div>
            );
          }
          case "vitals": {
            const own = placed("vitals");
            if (b.fields.length === 0 && own.length === 0) return null;
            return (
              <div key={b.id} role="group" aria-labelledby={`${idPrefix}-vitals-heading`} className="space-y-3">
                <p id={`${idPrefix}-vitals-heading`} className="text-sm font-medium leading-none flex items-center gap-1.5"><HeartPulse className="h-3.5 w-3.5" /> Vitals</p>
                {b.fields.length > 0 && <VitalsInputs fields={b.fields} idPrefix={idPrefix} extra={extra} onExtraChange={onExtraChange} />}
                {own.length > 0 && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{own.map(field)}</div>}
              </div>
            );
          }
          case "medicines":
            return <div key={b.id}>{renderMedicines()}</div>;
          case "advice": {
            const own = placed("advice");
            if (b.fields.length === 0 && own.length === 0) return null;
            return (
              <div key={b.id} role="group" aria-labelledby={`${idPrefix}-advice-heading`} className="space-y-3">
                <p id={`${idPrefix}-advice-heading`} className="text-sm font-medium leading-none flex items-center gap-1.5"><ClipboardList className="h-3.5 w-3.5" /> Advice</p>
                {b.fields.map((k) => {
                  const column = ADVICE_COLUMNS[k];
                  const id = `${idPrefix}-${k === "general" ? "advice" : k}`;
                  return (
                    <div key={k} className="space-y-1.5">
                      <Label htmlFor={id} className="text-xs text-muted-foreground">{ADVICE_LABELS[k]}</Label>
                      <Textarea id={id} rows={2} maxLength={2000} value={values[column]} onChange={(e) => onChange({ [column]: e.target.value })} />
                    </div>
                  );
                })}
                {own.map(field)}
              </div>
            );
          }
          case "follow_up":
            return (
              <div key={b.id} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor={`${idPrefix}-follow-date`}>Follow-up date</Label>
                  <Input id={`${idPrefix}-follow-date`} type="date" className="h-10" value={values.follow_up_date} onChange={(e) => onChange({ follow_up_date: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${idPrefix}-follow-note`}>Follow-up instructions</Label>
                  <Input id={`${idPrefix}-follow-note`} className="h-10" maxLength={500} value={values.follow_up_instructions} onChange={(e) => onChange({ follow_up_instructions: e.target.value })} />
                </div>
              </div>
            );
          case "custom":
            // A field placed inside a section is asked for by that section.
            return b.placement === "section" ? field(b) : null;
          default:
            return null; // signature is print-only
        }
      })}
    </>
  );
};

export default TemplateFormFields;
