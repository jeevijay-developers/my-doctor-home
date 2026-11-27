import type { PrescriptionSlipData } from "@/components/admin/PrescriptionSlip";
import { sampleValue } from "./extra";
import { isCustomBlock, type ExtraValues, type TemplateConfig } from "./types";

// Made-up prescription for the builder's live preview, with an example answer for every custom field.
export function sampleSlip(config: TemplateConfig, today: string): PrescriptionSlipData {
  const extra: ExtraValues = {};
  for (const b of config.blocks) if (isCustomBlock(b)) extra[b.id] = sampleValue(b);
  return {
    id: "preview-0000",
    patient_id: "sample-patient",
    patient_name: "Sample Patient",
    diagnosis: "Sample diagnosis",
    medications: null,
    medicines: [
      { name: "Paracetamol", strength: "500 mg", morning: 1, afternoon: 0, evening: 1, durationDays: 5, food: "after" },
      { name: "Amoxicillin", strength: "250 mg", morning: 1, afternoon: 1, evening: 1, durationDays: 7, food: "before" },
    ],
    advice: "Rest and drink plenty of fluids.",
    diet_advice: null,
    lifestyle_advice: null,
    follow_up_date: today,
    follow_up_instructions: "Review after the course.",
    date: today,
    patient_age: 34,
    patient_weight: 70,
    patient_gender: "male",
    visit: { visit_date: today, reason_for_visit: "Sample complaint", symptoms: "Sample symptoms" },
    vitals: { blood_pressure: "120/80", pulse: 72, temperature: 98.6, respiratory_rate: 16, spo2: 98, height: 170, weight: 70, bmi: 24.2 },
    extra,
  };
}
