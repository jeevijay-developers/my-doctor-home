import { describe, expect, it } from "vitest";
import { patientDefaults, prescriptionVitalsError, type PatientOption } from "./prescriptionPatient";

const patient = (over: Partial<PatientOption> = {}): PatientOption => ({
  id: "p1", name: "Aaryan", phone: "8871876376", gender: "male", age: 34, weight: 62.5, ...over,
});

describe("patientDefaults", () => {
  it("fills the prescription form from the patient record", () => {
    expect(patientDefaults(patient())).toEqual({ patient_id: "p1", patient_name: "Aaryan", patient_age: "34", patient_weight: "62.5" });
  });

  it("keeps an age of 0 (an infant) rather than treating it as missing", () => {
    expect(patientDefaults(patient({ age: 0 })).patient_age).toBe("0");
  });

  it("leaves age and weight blank when the patient has none, never reusing another patient's values", () => {
    expect(patientDefaults(patient({ age: null, weight: null }))).toEqual({
      patient_id: "p1", patient_name: "Aaryan", patient_age: "", patient_weight: "",
    });
  });
});

describe("prescriptionVitalsError", () => {
  it("accepts empty age and weight (both optional on a prescription)", () => {
    expect(prescriptionVitalsError({ patient_age: "", patient_weight: "" })).toBeNull();
  });

  it("accepts valid values", () => {
    expect(prescriptionVitalsError({ patient_age: "0", patient_weight: "3.4" })).toBeNull();
    expect(prescriptionVitalsError({ patient_age: "120", patient_weight: "500" })).toBeNull();
  });

  it("rejects an age above 120 and an out-of-range or malformed weight", () => {
    expect(prescriptionVitalsError({ patient_age: "121", patient_weight: "" })).toMatch(/valid age/i);
    expect(prescriptionVitalsError({ patient_age: "", patient_weight: "501" })).toMatch(/between/);
    expect(prescriptionVitalsError({ patient_age: "", patient_weight: "62.55" })).toMatch(/kg/);
  });
});
