// Shapes and wording for the patient import limits (see get_patient_import_access and
// import_patients). Pure, so the dialog and its tests share one set of messages.

export type ImportReason = "ok" | "plan" | "blocked" | "no_permission";

export type ImportAccess = {
  eligible: boolean;
  reason: ImportReason;
  cap?: number;
  patient_count?: number;
  remaining?: number;
  imports_today?: number;
  rows_today?: number;
  max_rows?: number;
  max_per_day?: number;
  max_rows_per_day?: number;
  pending_request?: boolean;
  cooldown_until?: string | null;
};

// The server may send numbers as strings or leave them out; anything unreadable counts as 0.
const num = (v: unknown): number => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};
const n = (v: unknown) => num(v).toLocaleString("en-IN");

/** The server refuses a JSON payload above this many bytes (octet_length(_rows::text)). */
export const MAX_PAYLOAD_BYTES = 2097152;
export const TOO_LARGE_MESSAGE = "This file is too large to import in one go. Split it into smaller files.";

export function importErrorMessage(code: string, details: Record<string, unknown> = {}): string {
  switch (code) {
    case "NOT_ELIGIBLE":
      return "Importing patients is available on the Pro and Premium plans.";
    case "DAILY_LIMIT": {
      const hasCounts = ["imports_today", "max_per_day", "rows_today", "max_rows_per_day"].every(
        (k) => details[k] !== undefined && details[k] !== null && Number.isFinite(Number(details[k])),
      );
      if (hasCounts) {
        if (num(details.imports_today) >= num(details.max_per_day)) {
          return `You have reached today's limit of ${n(details.max_per_day)} imports. Please try again tomorrow.`;
        }
        const left = Math.max(0, num(details.max_rows_per_day) - num(details.rows_today));
        return `You can import ${n(left)} more ${left === 1 ? "patient" : "patients"} in the next 24 hours.`;
      }
      return "You have reached today's import limit. Please try again tomorrow.";
    }
    case "PAYLOAD_INVALID": {
      const max = num(details.max_rows ?? 1000);
      // The server also refuses a payload over 2 MB. If we sent no more rows than allowed, size was the problem.
      if (details.sent_rows !== undefined && num(details.sent_rows) <= max) return TOO_LARGE_MESSAGE;
      return `A single import can have at most ${n(max)} patients.`;
    }
    case "CAP_EXCEEDED":
      return `This file would take you to ${n(num(details.current) + num(details.incoming))} patients, above your limit of ${n(details.cap)}.`;
    case "NOT_ALLOWED":
      return "You do not have permission to import patients.";
    default:
      return "Could not import. Please try again.";
  }
}

const ROW_MESSAGES: Record<string, string> = {
  ROW_INVALID: "This row could not be read.",
  NAME: "The name must be 2 to 100 characters.",
  PHONE: "The phone number is not a valid Indian mobile number.",
  AGE: "The age must be a number from 0 to 120.",
  GENDER: "The gender must be Male, Female or Other.",
  WEIGHT: "The weight must be between 0.5 and 500 kg.",
  EMAIL: "The email address is not valid.",
  NOTES: "The notes are too long.",
  DATE: "A date is not a real date, or is in the future.",
  DATE_ORDER: "The dates are in the wrong order.",
  VISITS: "Total visits must be a whole number from 0 to 10,000.",
};

export const rowErrorMessage = (code: string): string => ROW_MESSAGES[code] ?? "Could not be saved.";
