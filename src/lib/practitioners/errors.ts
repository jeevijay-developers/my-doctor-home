// User-facing text for every practitioner (multi-doctor) error code raised by the database.
// This is the ONE place these messages live.
export const PRACTITIONER_ERROR_CODES = [
  "PRACTITIONER_REQUIRED", "PRACTITIONER_MISMATCH", "PRACTITIONER_NOT_BOOKABLE", "PRACTITIONER_NOT_FOUND",
  "PRACTITIONER_IN_SERVICE", "USE_QUEUE_TRANSFER", "NOT_TRANSFERABLE", "SLOT_TAKEN", "PRIMARY_PRACTITIONER_REQUIRED",
  "SEAT_LIMIT", "MULTI_DOCTOR_NOT_ENABLED", "HAS_FUTURE_APPOINTMENTS", "OWNER_ONLY", "PHONE_OWNS_CLINIC",
  "PRACTITIONER_HAS_LOGIN", "NAME_REQUIRED",
  "DOCTOR_LOGIN_FORBIDDEN", "APPOINTMENT_CLOSED", "NOT_ALLOWED", "FORBIDDEN", "DOCTOR_UNAVAILABLE",
  "INVALID_SERVICE", "SERVICE_NOT_OFFERED",
] as const;
export type PractitionerErrorCode = (typeof PRACTITIONER_ERROR_CODES)[number];

const MESSAGES: Record<PractitionerErrorCode, string> = {
  PRACTITIONER_REQUIRED: "Please choose a doctor.",
  PRACTITIONER_MISMATCH: "That doctor is not part of this clinic.",
  PRACTITIONER_NOT_BOOKABLE: "This doctor is not taking bookings right now.",
  PRACTITIONER_NOT_FOUND: "That doctor could not be found. Refresh and try again.",
  PRACTITIONER_IN_SERVICE: "This patient is with the doctor now and can't be moved.",
  USE_QUEUE_TRANSFER: "To move today's patient to another doctor, use Transfer in the live queue.",
  NOT_TRANSFERABLE: "Only today's waiting patients can be transferred.",
  SLOT_TAKEN: "The other doctor already has a patient at that time.",
  PRIMARY_PRACTITIONER_REQUIRED: "Make another doctor the main doctor first.",
  SEAT_LIMIT: "All your doctor seats are in use. Add a seat or stop bookings for another doctor.",
  MULTI_DOCTOR_NOT_ENABLED: "Multiple doctors is not enabled for your clinic yet.",
  HAS_FUTURE_APPOINTMENTS: "This doctor still has upcoming appointments. Move or cancel them first.",
  OWNER_ONLY: "Only the clinic owner can do this.",
  PHONE_OWNS_CLINIC: "This number already runs its own clinic on Doctylia. Use another number, or add the doctor without a login.",
  PRACTITIONER_HAS_LOGIN: "This doctor already has a login.",
  NAME_REQUIRED: "Enter the doctor's name.",
  DOCTOR_LOGIN_FORBIDDEN: "Doctor logins can't create or move bookings. Please ask reception.",
  APPOINTMENT_CLOSED: "Completed or closed visits can't be moved to another doctor.",
  NOT_ALLOWED: "You don't have access to this prescription.",
  FORBIDDEN: "You can only manage your own queue.",
  DOCTOR_UNAVAILABLE: "This doctor is no longer taking bookings.",
  INVALID_SERVICE: "This doctor doesn't offer that service. Please choose another service or doctor.",
  SERVICE_NOT_OFFERED: "This doctor doesn't offer that service. Please choose another service or doctor.",
};

// Longest first, so a code that contains another one (PRIMARY_PRACTITIONER_REQUIRED
// contains PRACTITIONER_REQUIRED) is matched as itself.
const MATCH_ORDER = [...PRACTITIONER_ERROR_CODES].sort((a, b) => b.length - a.length);

/** User-facing text for a practitioner error code found anywhere in `raw`; null if none. */
export function practitionerErrorMessage(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Whole-word match so FORBIDDEN does not fire inside DOCTOR_LOGIN_FORBIDDEN or other tokens.
  const code = MATCH_ORDER.find((c) => new RegExp(`(?<![A-Z0-9_])${c}(?![A-Z0-9_])`).test(raw));
  return code ? MESSAGES[code] : null;
}
