import type { PostgrestError } from "@supabase/supabase-js";

// Turns a raw Postgres/PostgREST error into a specific, actionable message
// instead of a blanket "Could not save X" — and always logs the real error
// (code/message/details/hint, never row payload values) so a failure is
// diagnosable from the browser console without needing server-side logs.
export function dbErrorMessage(error: PostgrestError, context: string, fallback: string): string {
  console.error(`${context} failed:`, { code: error.code, message: error.message, details: error.details, hint: error.hint });

  switch (error.code) {
    case "42P01": // undefined_table
      return "This feature hasn't finished setting up on the server yet. Please try again shortly, or contact support.";
    case "23503": // foreign_key_violation
      return "Could not link this record to the patient. Please refresh the page and try again.";
    case "23502": // not_null_violation
      return "A required field is missing. Please fill in all required fields and try again.";
    case "23505": // unique_violation
      return "A matching record already exists.";
    case "23514": // check_violation
    case "22P02": // invalid_text_representation (e.g. bad enum value)
      return "One of the values entered isn't valid for this field. Please check your entries and try again.";
    case "42501": // insufficient_privilege (RLS denial)
      return "You don't have permission to do this.";
    default:
      return error.message ? `${fallback}: ${error.message}` : fallback;
  }
}
