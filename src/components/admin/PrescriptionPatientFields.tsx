import { useState } from "react";
import { Calendar, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DigitsInput } from "@/components/ui/digits-input";
import { AmountInput } from "@/components/ui/amount-input";
import PatientCombobox from "./PatientCombobox";
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
  /** The clinic whose patients can be searched (patients.doctor_id). */
  clinicId: string;
  /** The prescribing doctor; patients seen by them are listed first in multi-doctor clinics. */
  practitionerId?: string | null;
  value: PatientFieldsValue;
  onChange: (patch: Partial<PatientFieldsValue>) => void;
};

// The patient / date / age / weight block shared by the Add and Edit prescription forms.
// Patients are found by a server-side search (name or phone). Choosing one fills their name, age
// and weight, so the name field is hidden; age and weight stay editable because they change
// between visits. The stored name is shown on the picker, so it is never lost.
const PrescriptionPatientFields = ({ idPrefix, selectLabel, clinicId, practitionerId, value, onChange }: Props) => {
  const linked = !!value.patient_id;
  const [picked, setPicked] = useState<PatientOption | null>(null);
  const label = picked && picked.id === value.patient_id ? `${picked.name} (${picked.phone})` : value.patient_name;

  const choose = (p: PatientOption) => {
    setPicked(p);
    onChange(patientDefaults(p));
  };
  const clear = () => {
    setPicked(null);
    onChange({ patient_id: "", patient_name: "", patient_age: "", patient_weight: "" });
  };

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
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor={`${idPrefix}-patient`}>{selectLabel}</Label>
          {value.patient_id && (
            <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground" onClick={clear}>
              <X className="h-3 w-3 mr-1" /> Clear patient
            </Button>
          )}
        </div>
        <PatientCombobox
          id={`${idPrefix}-patient`}
          clinicId={clinicId}
          practitionerId={practitionerId}
          value={value.patient_id}
          valueLabel={label}
          onSelect={choose}
        />
      </div>
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
