// Shared by the patient booking widget and the manage/reschedule page so the
// two flows can never disagree on how slots are generated from a doctor's
// working hours.
export const SLOT_DURATION_OPTIONS = [5, 10, 15, 20, 30, 45, 60] as const;
export type SlotDurationMinutes = (typeof SLOT_DURATION_OPTIONS)[number];
export const DEFAULT_SLOT_DURATION_MINUTES: SlotDurationMinutes = 30;

/**
 * Generates "HH:MM" slot start times between start/end at the given interval.
 * A slot is only included if it fully fits before `end` — e.g. a 45-minute
 * slot starting at 11:30 within a 10:00–12:00 window is excluded because it
 * would run until 12:15, past the doctor's working hours.
 */
export const generateTimeSlots = (
  start: string | null | undefined,
  end: string | null | undefined,
  durationMinutes: number = DEFAULT_SLOT_DURATION_MINUTES,
): string[] => {
  if (!start || !end) return [];
  const step = durationMinutes > 0 ? durationMinutes : DEFAULT_SLOT_DURATION_MINUTES;
  const slots: string[] = [];
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let current = sh * 60 + sm;
  const endMin = eh * 60 + em;
  while (current + step <= endMin) {
    const h = Math.floor(current / 60);
    const m = current % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    current += step;
  }
  return slots;
};
