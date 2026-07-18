// Shared Indian mobile validation helper.
// Rules: 10 digits, starts with 6/7/8/9. Accepts optional +91 or 0 prefix and
// strips spaces/dashes before validating.
export const normalizeIndianPhone = (raw: string): string => {
  if (!raw) return "";
  let digits = raw.replace(/[^\d]/g, "");
  if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  return digits;
};

export const isValidIndianPhone = (raw: string): boolean => {
  const d = normalizeIndianPhone(raw);
  return /^[6-9]\d{9}$/.test(d);
};

export const phoneErrorMessage =
  "Enter a valid 10-digit Indian mobile number (starting with 6, 7, 8 or 9).";
