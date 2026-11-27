// Pure helpers for doctor-seat purchases (create-doctor-seat-order and the
// optional `seats` add-on of create-plan-upgrade-order). The seat-only amount
// is computed in SQL (seat_order_quote); nothing here prices a standalone
// seat order. No Deno/npm imports: unit-tested under Vitest.

/** A seat quantity for a standalone order: an integer 1..1000, else null. */
export function parseSeatQty(raw: unknown): number | null {
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 1 && raw <= 1000 ? raw : null;
}

/** platform_settings.doctor_seat_price (jsonb number) -> positive price, else null (= not set). */
export function seatPriceFromSetting(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

export type RenewalSeats = { ok: true; seats: number } | { ok: false; error: "INVALID_QTY" | "SEAT_MAX" };

/** Optional `seats` on a renewal: absent/null/0 -> 0, else integer 1..seatMax-1. */
export function parseRenewalSeats(raw: unknown, seatMax: number): RenewalSeats {
  if (raw === undefined || raw === null || raw === 0) return { ok: true, seats: 0 };
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0) return { ok: false, error: "INVALID_QTY" };
  if (raw > seatMax - 1) return { ok: false, error: "SEAT_MAX" };
  return { ok: true, seats: raw };
}

/** Plan price + seats x seat price, summed in whole paise, returned in rupees. */
export function renewalTotalRupees(planRupees: number, seats: number, seatPriceRupees: number): number {
  const paise = Math.round(planRupees * 100) + seats * Math.round(seatPriceRupees * 100);
  return paise / 100;
}

/** Map a seat_order_quote error code to an HTTP response; unknown -> 500. */
export function quoteErrorResponse(code: unknown): { status: number; error: string } {
  switch (code) {
    case "NOT_ENABLED": return { status: 403, error: "NOT_ENABLED" };
    case "PLAN_NOT_ELIGIBLE": return { status: 409, error: "PLAN_NOT_ELIGIBLE" };
    case "PRICE_NOT_SET": return { status: 409, error: "PRICE_NOT_SET" };
    case "INVALID_QTY": return { status: 400, error: "INVALID_QTY" };
    case "SEAT_MAX": return { status: 400, error: "SEAT_MAX" };
    default: return { status: 500, error: "QUOTE_FAILED" };
  }
}
