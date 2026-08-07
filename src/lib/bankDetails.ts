// Shared Bank/UPI payout-details validation (doctor's Bank/UPI Setup form).
// Kept in one place so the client-side inline check and the
// add-doctor-bank-account edge function's server-side check never drift.

// Standard IFSC: 4 alphabetic bank-code letters, a literal "0" (reserved),
// then 6 alphanumeric branch-code characters. e.g. HDFC0001234.
export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const ifscErrorMessage = "Enter a valid IFSC code, e.g. HDFC0001234 (4 letters + 0 + 6 alphanumeric characters).";
export const isValidIfsc = (raw: string): boolean => IFSC_REGEX.test(raw.trim().toUpperCase());

// Bank account numbers vary in length across banks (typically 9–18 digits);
// kept generous to avoid rejecting legitimate numbers.
export const ACCOUNT_NUMBER_REGEX = /^\d{6,20}$/;
export const accountNumberErrorMessage = "Enter a valid bank account number (6–20 digits, numbers only).";
export const isValidAccountNumber = (raw: string): boolean => ACCOUNT_NUMBER_REGEX.test(raw.trim());

// UPI VPA: local-part@bank-handle, e.g. yourname@okhdfcbank.
export const UPI_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
export const upiErrorMessage = "Enter a valid UPI ID, e.g. yourname@okhdfcbank.";
export const isValidUpi = (raw: string): boolean => UPI_REGEX.test(raw.trim());
