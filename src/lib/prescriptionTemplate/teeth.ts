import type { ToothMap, ToothStatus } from "./types";

// FDI two-digit numbering, drawn the way a dentist reads a chart (patient's right on the left).
export const UPPER_TEETH = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"] as const;
export const LOWER_TEETH = ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"] as const;
export const ALL_TEETH: readonly string[] = [...UPPER_TEETH, ...LOWER_TEETH];

export const TOOTH_STATUSES: ReadonlyArray<{ key: ToothStatus; code: string; label: string; bg: string; fg: string }> = [
  { key: "decayed", code: "D", label: "Decayed", bg: "#fee2e2", fg: "#991b1b" },
  { key: "restored", code: "R", label: "Restored", bg: "#dbeafe", fg: "#1e40af" },
  { key: "missing", code: "M", label: "Missing", bg: "#e5e7eb", fg: "#374151" },
  { key: "root_stump", code: "RS", label: "Root stump", bg: "#ffedd5", fg: "#9a3412" },
  { key: "mobile", code: "Mob", label: "Mobile", bg: "#fef9c3", fg: "#854d0e" },
  { key: "fractured", code: "Fx", label: "Fractured", bg: "#fce7f3", fg: "#9d174d" },
  { key: "prosthesis", code: "Pr", label: "Prosthesis", bg: "#dcfce7", fg: "#166534" },
];

const STATUS_KEYS = new Set<string>(TOOTH_STATUSES.map((s) => s.key));
const TEETH = new Set<string>(ALL_TEETH);

export const toothStatusInfo = (key: ToothStatus) => TOOTH_STATUSES.find((s) => s.key === key)!;

// Tolerant read of a stored tooth map: unknown teeth and statuses are dropped.
export function parseToothMap(value: unknown): ToothMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: ToothMap = {};
  for (const [tooth, status] of Object.entries(value as Record<string, unknown>)) {
    if (TEETH.has(tooth) && typeof status === "string" && STATUS_KEYS.has(status)) out[tooth] = status as ToothStatus;
  }
  return out;
}
