// Shared shape for a single structured medicine line item on a prescription.
// Used by both the prescription form (PrescriptionsPage.tsx) and the
// printable slip (PrescriptionSlip.tsx) so the shape is defined once.
export type MedicineItem = {
  name: string;
  strength: string;
  frequency: string;
  duration: string;
  timing: string;
  route: string;
  instructions: string;
};

export const emptyMedicineItem = (): MedicineItem => ({
  name: "", strength: "", frequency: "", duration: "", timing: "", route: "", instructions: "",
});

// prescriptions.medicines is stored as Json; narrow it to MedicineItem[] for
// display, tolerating older/malformed rows by dropping anything without a name.
export const parseMedicineItems = (value: unknown): MedicineItem[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null)
    .map((v) => ({
      name: typeof v.name === "string" ? v.name : "",
      strength: typeof v.strength === "string" ? v.strength : "",
      frequency: typeof v.frequency === "string" ? v.frequency : "",
      duration: typeof v.duration === "string" ? v.duration : "",
      timing: typeof v.timing === "string" ? v.timing : "",
      route: typeof v.route === "string" ? v.route : "",
      instructions: typeof v.instructions === "string" ? v.instructions : "",
    }))
    .filter((m) => m.name.trim() !== "");
};
