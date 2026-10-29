// Booking token a patient uses (with their phone) to look up, reschedule or cancel a visit.
// It is the only secret behind those links, so it must not be guessable: 7 characters from a
// 31-letter alphabet is ~27 billion values, drawn from the browser's secure random source.
// (Older bookings carry short T123-style tokens; lookups still accept them.)
//
// supabase/functions/verify-razorpay-payment/index.ts generates tokens the same way on
// Deno; keep the alphabet and length in step.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L: easy to read out loud
const LENGTH = 7;

export function generateBookingToken(): string {
  const bytes = new Uint8Array(LENGTH);
  crypto.getRandomValues(bytes);
  let out = "T";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

// What a patient types is matched exactly, so forgive case and stray spaces.
export const normalizeBookingToken = (value: string) => value.trim().toUpperCase();
