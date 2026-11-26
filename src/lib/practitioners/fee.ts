import type { PublicPractitioner } from "./types";

/** A doctor's own fee when set (> 0), else the clinic's; the same rule public_booking_price uses. */
export const practitionerFee = (p: Pick<PublicPractitioner, "consultation_fee"> | null | undefined, clinicFee: unknown): number => {
  const own = Number(p?.consultation_fee);
  if (Number.isFinite(own) && own > 0) return own;
  const clinic = clinicFee == null ? NaN : Number(clinicFee);
  return Number.isFinite(clinic) ? clinic : 500;
};
