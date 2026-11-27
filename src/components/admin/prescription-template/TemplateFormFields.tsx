import type { ReactNode } from "react";
import { ClipboardList, Stethoscope } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { TemplateConfig } from "@/lib/prescriptionTemplate/types";
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

// The inputs of the template's enabled sections, in the template's order. Sections that are only
// printed (vitals, signature) have no input.
const TemplateFormFields = ({ config, idPrefix, values, onChange, extra, onExtraChange, renderMedicines }: Props) => (
  <>
    {config.blocks.filter((b) => b.enabled).map((b) => {
      switch (b.type) {
        case "patient_info":
          return b.fields.includes("diagnosis") ? (
            <div key={b.id} className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-diagnosis`} className="flex items-center gap-1.5"><Stethoscope className="h-3.5 w-3.5" /> Diagnosis</Label>
              <Input
                id={`${idPrefix}-diagnosis`} className="h-10" placeholder="e.g. Acute bronchitis"
                value={values.diagnosis} onChange={(e) => onChange({ diagnosis: e.target.value })}
              />
            </div>
          ) : null;
        case "medicines":
          return <div key={b.id}>{renderMedicines()}</div>;
        case "advice":
          return (
            <div key={b.id} className="space-y-3">
              <Label className="flex items-center gap-1.5"><ClipboardList className="h-3.5 w-3.5" /> Advice</Label>
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-advice`} className="text-xs text-muted-foreground">General advice</Label>
                <Textarea id={`${idPrefix}-advice`} rows={2} maxLength={2000} value={values.advice} onChange={(e) => onChange({ advice: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-diet`} className="text-xs text-muted-foreground">Diet advice</Label>
                <Textarea id={`${idPrefix}-diet`} rows={2} maxLength={2000} value={values.diet_advice} onChange={(e) => onChange({ diet_advice: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-lifestyle`} className="text-xs text-muted-foreground">Lifestyle advice</Label>
                <Textarea id={`${idPrefix}-lifestyle`} rows={2} maxLength={2000} value={values.lifestyle_advice} onChange={(e) => onChange({ lifestyle_advice: e.target.value })} />
              </div>
            </div>
          );
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
          return (
            <CustomFieldInput
              key={b.id} block={b} idPrefix={idPrefix}
              value={extra[b.id]} onChange={(v) => onExtraChange(b.id, v)}
            />
          );
        default:
          return null; // vitals and signature are print-only
      }
    })}
  </>
);

export default TemplateFormFields;
