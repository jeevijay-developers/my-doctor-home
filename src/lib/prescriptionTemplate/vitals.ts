import { VITAL_KEYS, sysVitalKey, type ExtraValues, type VitalKey } from "./types";

type VitalMeta = {
  /** Short label printed on the slip chip. */
  chip: string;
  /** Label in the form and the builder. */
  label: string;
  unit: string;
  placeholder: string;
  min?: number;
  max?: number;
};

// Ranges only catch typing slips (a pulse of 720), not clinical judgement.
export const VITAL_META: Record<VitalKey, VitalMeta> = {
  blood_pressure: { chip: "BP", label: "Blood pressure", unit: "mmHg", placeholder: "120/80" },
  pulse: { chip: "Pulse", label: "Pulse", unit: "bpm", placeholder: "72", min: 20, max: 250 },
  // Always degrees Fahrenheit (the slip prints °F), so a Celsius-looking 37.5 is refused instead of misread.
  temperature: { chip: "Temp", label: "Temperature", unit: "°F", placeholder: "98.6", min: 80, max: 115 },
  respiratory_rate: { chip: "RR", label: "Respiratory rate", unit: "/min", placeholder: "16", min: 4, max: 80 },
  spo2: { chip: "SpO2", label: "SpO2", unit: "%", placeholder: "98", min: 50, max: 100 },
  height: { chip: "Height", label: "Height", unit: "cm", placeholder: "170", min: 30, max: 250 },
  weight: { chip: "Weight", label: "Weight", unit: "kg", placeholder: "70", min: 1, max: 400 },
  bmi: { chip: "BMI", label: "BMI", unit: "", placeholder: "auto", min: 5, max: 80 },
};

const BP = /^(\d{2,3})\s*\/\s*(\d{2,3})$/;

export const isVitalKey = (k: string): k is VitalKey => (VITAL_KEYS as readonly string[]).includes(k);

/** How a vital reads on the slip: "BP: 120/80", "Pulse: 72 bpm", "Temp: 98.6°F". */
export function formatVital(k: VitalKey, v: unknown): string {
  const value = String(v);
  switch (k) {
    case "blood_pressure": return value;
    case "temperature": return `${value}°F`;
    case "respiratory_rate": return `${value}/min`;
    case "spo2": return `${value}%`;
    case "bmi": return value;
    default: return `${value} ${VITAL_META[k].unit}`.trim();
  }
}

export const computeBmi = (heightCm: number, weightKg: number): number | undefined => {
  if (!(heightCm > 0) || !(weightKg > 0)) return undefined;
  const bmi = weightKg / (heightCm / 100) ** 2;
  return Number.isFinite(bmi) ? Math.round(bmi * 10) / 10 : undefined;
};

/** One typed vital as what is stored: a normalised "120/80" or a number in range; undefined = nothing. */
export function cleanVital(k: VitalKey, raw: unknown): string | number | undefined {
  if (k === "blood_pressure") {
    const m = typeof raw === "string" ? raw.trim().match(BP) : null;
    if (!m) return undefined;
    const sys = Number(m[1]);
    const dia = Number(m[2]);
    return sys >= 50 && sys <= 300 && dia >= 30 && dia <= 200 && dia <= sys ? `${sys}/${dia}` : undefined;
  }
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
  const { min = -Infinity, max = Infinity } = VITAL_META[k];
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
}

/** A plain-words problem with a typed vital, or null when it is empty or fine. */
export function vitalError(k: VitalKey, raw: unknown): string | null {
  if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) return null;
  if (cleanVital(k, raw) !== undefined) return null;
  const { label, min, max, unit } = VITAL_META[k];
  if (k === "blood_pressure") return `${label} must look like 120/80.`;
  return `${label} must be a number between ${min} and ${max}${unit ? ` ${unit}` : ""}.`;
}

/**
 * The vitals to print: for each offered vital the prescription's own answer, else the linked visit's
 * (older prescriptions took their vitals only from a visit).
 */
export function vitalsForSlip(
  fields: readonly VitalKey[],
  extra: ExtraValues,
  visit: Partial<Record<VitalKey, unknown>> | null | undefined,
): Array<{ key: VitalKey; label: string; text: string }> {
  const out: Array<{ key: VitalKey; label: string; text: string }> = [];
  for (const k of fields) {
    const own = extra[sysVitalKey(k)];
    const value = own !== undefined && own !== "" ? own : visit?.[k];
    if (value === undefined || value === null || value === "") continue;
    out.push({ key: k, label: VITAL_META[k].chip, text: formatVital(k, value) });
  }
  return out;
}
