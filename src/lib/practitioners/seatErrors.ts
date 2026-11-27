// Plain-language text for the codes get_seat_order_quote / create-doctor-seat-order answer with.
const MESSAGES: Record<string, string> = {
  NOT_ENABLED: "Multiple doctors is not enabled for your clinic yet.",
  PRICE_NOT_SET: "Buying extra doctor seats is not available right now.",
  PLAN_NOT_ELIGIBLE: "Extra seats can be added only on an active Premium plan with time left. Renew or upgrade your plan first.",
  INVALID_QTY: "Enter a valid number of seats.",
  SEAT_MAX: "That would go over the maximum number of doctor seats a clinic can have. Try fewer seats.",
  FORBIDDEN: "You do not have permission to buy seats. Ask the clinic owner.",
};

export const seatErrorMessage = (code: string | null | undefined): string | null =>
  (code && MESSAGES[code]) || null;

// Why a captured seat payment was not applied (verify-plan-upgrade-payment `code`, lower case).
const REFUND_REASONS: Record<string, string> = {
  plan_lapsed: "your plan has ended",
  cap_exceeded: "that would go over the maximum number of doctor seats",
  not_enabled: "Multiple doctors is not enabled for your clinic",
  invalid_qty: "the number of seats was not valid",
  cancelled: "the order was cancelled",
  order_expired: "the order expired",
  plan_changed: "your plan changed while you were paying",
  not_applied: "they could not be applied",
};

export const seatRefundReason = (code: string | null | undefined): string =>
  (code && REFUND_REASONS[code]) || "an unexpected problem";
