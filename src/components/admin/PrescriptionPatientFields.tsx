import { Calendar, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DigitsInput } from "@/components/ui/digits-input";
import { AmountInput } from "@/components/ui/amount-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { patientDefaults, type PatientOption } from "@/lib/prescriptionPatient";

export type PatientFieldsValue = {
  patient_id: string;
  patient_name: string;
  date: string;
  patient_age: string;
  patient_weight: string;
};

type Props = {
  idPrefix: string;
  selectLabel: string;
  patients: PatientOption[];
  value: PatientFieldsValue;
  onChange: (patch: Partial<PatientFieldsValue>) => void;
};

// The patient / date / age / weight block shared by the Add and Edit prescription forms.
// Choosing a patient fills their name, age and weight, so the name field is hidden; age and
// weight stay editable because they change between visits. If the prescription is linked to a
// patient who is not in the loaded list, the name field stays so the name is never lost.
const PrescriptionPatientFields = ({ idPrefix, selectLabel, patients, value, onChange }: Props) => {
  const linked = patients.some((p) => p.id === value.patient_id);

  const choose = (id: string) => {
    const p = patients.find((x) => x.id === id);
    if (p) onChange(patientDefaults(p));
  };
  const clear = () => onChange({ patient_id: "", patient_name: "", patient_age: "", patient_weight: "" });

  const dateField = (
    <div className="space-y-1.5">
      <Label htmlFor={`${idPrefix}-date`} className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Date</Label>
      <Input id={`${idPrefix}-date`} type="date" value={value.date} onChange={(e) => onChange({ date: e.target.value })} className="h-10" />
    </div>
  );
  const ageField = (
    <div className="space-y-1.5">
      <Label htmlFor={`${idPrefix}-age`}>Age</Label>
      <DigitsInput id={`${idPrefix}-age`} maxLength={3} value={value.patient_age} onChange={(e) => onChange({ patient_age: e.target.value })} className="h-10" />
    </div>
  );
  const weightField = (
    <div className="space-y-1.5">
      <Label htmlFor={`${idPrefix}-weight`}>Weight (kg)</Label>
      <AmountInput id={`${idPrefix}-weight`} maxLength={5} value={value.patient_weight} onChange={(e) => onChange({ patient_weight: e.target.value })} className="h-10" />
    </div>
  );

  return (
    <>
      {patients.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor={`${idPrefix}-patient`}>{selectLabel}</Label>
            {value.patient_id && (
              <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground" onClick={clear}>
                <X className="h-3 w-3 mr-1" /> Clear patient
              </Button>
            )}
          </div>
          <Select value={value.patient_id} onValueChange={choose}>
            <SelectTrigger id={`${idPrefix}-patient`} aria-label="Patient" className="h-10"><SelectValue placeholder="-- Or type name below --" /></SelectTrigger>
            <SelectContent className="max-h-[200px]">
              {patients.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.phone})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      {linked ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {dateField}
          {ageField}
          {weightField}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-name`} className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> Patient Name *</Label>
              <Input id={`${idPrefix}-name`} value={value.patient_name} onChange={(e) => onChange({ patient_name: e.target.value })} className="h-10" />
            </div>
            {dateField}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {ageField}
            {weightField}
          </div>
        </>
      )}
    </>
  );
};

export default PrescriptionPatientFields;
