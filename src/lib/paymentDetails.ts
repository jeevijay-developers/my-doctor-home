// Counter-payment details: how the patient paid and, for UPI / card, the reference that
// lets the doctor verify it later. The database enforces the same rules
// (enforce_payment_reference trigger in 20261118100000_payment_details_and_vitals.sql).

export type CounterPaymentMethod = "cash" | "upi" | "card";

export const COUNTER_PAYMENT_METHODS: { value: CounterPaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
];

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  other: "Other",
  online: "Online",
};

// `gateway` is appointments.payment_gateway: money taken through Razorpay is "Online".
export function paymentMethodLabel(method: string | null | undefined, gateway?: string | null): string {
  if (gateway) return "Online";
  if (!method) return "Not recorded";
  return METHOD_LABELS[method] ?? method.toUpperCase();
}

export function methodNeedsReference(method: string | null | undefined): boolean {
  return method === "upi" || method === "card";
}

export const REFERENCE_FIELDS = {
  upi: { label: "UTR / UPI reference no.", placeholder: "12-digit UTR", inputMode: "numeric" as const },
  card: { label: "Approval code / last 4 digits", placeholder: "e.g. 4242 or A1B2C3", inputMode: "text" as const },
};

export function normalizePaymentReference(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

export function paymentReferenceError(method: string | null | undefined, raw: string): string | null {
  const ref = normalizePaymentReference(raw);
  if (method === "upi") {
    if (!ref) return "Enter the 12-digit UTR / UPI reference number.";
    if (!/^\d{12}$/.test(ref)) return "A UPI reference (UTR) is exactly 12 digits.";
  }
  if (method === "card") {
    if (!ref) return "Enter the card approval code or the last 4 digits.";
    if (!/^[A-Z0-9]{4,12}$/.test(ref)) return "Use 4 to 12 letters or digits (approval code or last 4 digits).";
  }
  return null;
}

// The reference to store: only UPI / card carry one.
export function paymentReferenceToStore(method: string | null | undefined, raw: string): string | null {
  return methodNeedsReference(method) ? normalizePaymentReference(raw) || null : null;
}

export const PAYMENT_DB_ERRORS: Record<string, string> = {
  PAYMENT_REFERENCE_REQUIRED: "Enter the UTR / reference number for UPI and card payments.",
  PAYMENT_REFERENCE_INVALID: "That payment reference is not in the right format.",
  DUPLICATE_PAYMENT_REFERENCE: "This UTR is already recorded against another payment.",
};

// Maps a Postgres error from a direct appointments write to a friendly message, or null.
export function paymentDbErrorMessage(error: { message?: string; code?: string } | null | undefined): string | null {
  if (!error) return null;
  const text = `${error.message ?? ""}`;
  for (const code of Object.keys(PAYMENT_DB_ERRORS)) {
    if (text.includes(code)) return PAYMENT_DB_ERRORS[code];
  }
  if (error.code === "23505" && text.includes("appointments_upi_reference_unique")) {
    return PAYMENT_DB_ERRORS.DUPLICATE_PAYMENT_REFERENCE;
  }
  return null;
}
