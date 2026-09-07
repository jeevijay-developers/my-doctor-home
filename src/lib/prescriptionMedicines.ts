// Shared shape for a single structured medicine line item on a prescription.
// Used by both the prescription form (PrescriptionsPage.tsx) and the
// printable slip (PrescriptionSlip.tsx) so the shape is defined once.
//
// morning/afternoon/evening are stored as 0/1 (0 = not taken, 1 = taken at
// that time of day) — the standard Indian Rx "1-0-1" dosage notation.
export type MedicineItem = {
  name: string;
  strength: string;
  morning: 0 | 1;
  afternoon: 0 | 1;
  evening: 0 | 1;
  durationDays: number;
  food: "before" | "after";
};

export const emptyMedicineItem = (): MedicineItem => ({
  name: "", strength: "", morning: 0, afternoon: 0, evening: 0, durationDays: 0, food: "after",
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
      morning: v.morning === 1 ? 1 : 0,
      afternoon: v.afternoon === 1 ? 1 : 0,
      evening: v.evening === 1 ? 1 : 0,
      durationDays: typeof v.durationDays === "number" && v.durationDays > 0 ? v.durationDays : 0,
      food: v.food === "before" ? "before" : "after",
    } satisfies MedicineItem))
    .filter((m) => m.name.trim() !== "");
};
