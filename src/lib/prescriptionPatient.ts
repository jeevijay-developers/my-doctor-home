import { ageError, weightError } from "./patientIntake";

export type PatientOption = {
  id: string;
  name: string;
  phone: string;
  gender: string | null;
  age: number | null;
  weight: number | null;
};

// What picking a patient puts into the prescription form. Age and weight are always replaced
// (blank when the record has none) so a previous patient's values can never carry over.
export function patientDefaults(p: PatientOption) {
  return {
    patient_id: p.id,
    patient_name: p.name,
    patient_age: p.age != null ? String(p.age) : "",
    patient_weight: p.weight != null ? String(p.weight) : "",
  };
}

// Age and weight are optional on a prescription; when given they follow the same rules as the
// Add Patient / Add Appointment forms.
export function prescriptionVitalsError(f: { patient_age: string; patient_weight: string }): string | null {
  if (f.patient_age.trim()) {
    const e = ageError(f.patient_age);
    if (e) return e;
  }
  return weightError(f.patient_weight);
}
