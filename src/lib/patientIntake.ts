// Shared validation for the patient details collected on both the Add Appointment and
// Add Patient forms, so the two forms can never disagree.

export const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
] as const;

export const MAX_AGE = 120;
export const MIN_WEIGHT_KG = 0.5;
export const MAX_WEIGHT_KG = 500;

export function nameError(raw: string): string | null {
  const name = raw.trim();
  if (!name) return "Patient name is required";
  if (name.length < 2) return "Enter the patient's full name";
  if (name.length > 100) return "Name is too long (100 characters at most)";
  return null;
}

export function ageError(raw: string): string | null {
  const v = raw.trim();
  if (!v) return "Age is required";
  if (!/^\d{1,3}$/.test(v) || Number(v) > MAX_AGE) return `Enter a valid age (0-${MAX_AGE})`;
  return null;
}

export function genderError(raw: string): string | null {
  return GENDER_OPTIONS.some((g) => g.value === raw) ? null : "Select the patient's gender";
}

// Weight is optional; when given it must be a plain number with at most one decimal place.
export function weightError(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (!/^\d{1,3}(\.\d)?$/.test(v)) return "Enter the weight in kg, e.g. 62 or 62.5";
  const n = Number(v);
  if (n < MIN_WEIGHT_KG || n > MAX_WEIGHT_KG) return `Weight must be between ${MIN_WEIGHT_KG} and ${MAX_WEIGHT_KG} kg`;
  return null;
}

export function parseWeight(raw: string): number | null {
  const v = raw.trim();
  return v === "" ? null : Math.round(Number(v) * 10) / 10;
}

// Email is optional; checked loosely (a typo catcher, not an RFC parser).
export function emailError(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? null : "Enter a valid email address";
}

export type VitalsErrors = { age?: string; gender?: string; weight?: string };

export function vitalsErrors(v: { age: string; gender: string; weight: string }): VitalsErrors {
  const out: VitalsErrors = {};
  const age = ageError(v.age);
  const gender = genderError(v.gender);
  const weight = weightError(v.weight);
  if (age) out.age = age;
  if (gender) out.gender = gender;
  if (weight) out.weight = weight;
  return out;
}
