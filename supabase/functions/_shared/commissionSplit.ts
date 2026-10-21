// Pure helper module for server-authoritative service pricing and
// integer-paise platform commission split calculations.
// Keep in sync with src/lib/commissionSplit.ts.

export const DEFAULT_PLATFORM_COMMISSION_PERCENT = 10;

export interface CommissionSplitResult {
  /** Clamped commission percentage in [0, 100] */
  commissionPercent: number;
  /** Gross consultation/service fee in integer paise */
  grossPaise: number;
  /** Platform charge deducted by Doctylia in integer paise */
  commissionPaise: number;
  /** Net amount routed to the doctor's Razorpay Linked Account in integer paise */
  doctorNetPaise: number;
  /** Gross consultation/service fee in INR (2 decimal places) */
  grossAmount: number;
  /** Platform charge in INR (2 decimal places) */
  commissionAmount: number;
  /** Doctor's net share in INR (2 decimal places) */
  doctorShare: number;
}

/**
 * Resolves the effective platform commission percentage for a doctor.
 * Doctor-specific override (`doctorCommissionPercent`) takes precedence when
 * non-null and finite; otherwise falls back to `defaultCommissionPercent`
 * (or 10% if unset). Clamped to [0, 100].
 */
export function resolveCommissionPercent(
  doctorCommissionPercent?: number | string | null,
  defaultCommissionPercent?: number | string | null,
): number {
  const parseFinite = (val: unknown): number | null => {
    if (val === null || val === undefined || val === "") return null;
    const n = typeof val === "number" ? val : Number(val);
    return Number.isFinite(n) ? n : null;
  };

  const raw =
    parseFinite(doctorCommissionPercent) ??
    parseFinite(defaultCommissionPercent) ??
    DEFAULT_PLATFORM_COMMISSION_PERCENT;

  return Math.min(100, Math.max(0, Math.round(raw * 100) / 100));
}

/**
 * Computes the exact integer-paise split between Doctylia (platform commission)
 * and the Doctor's Razorpay Route Linked Account.
 *
 * Invariant: `commissionPaise + doctorNetPaise === grossPaise`
 */
export function calculateCommissionSplit(
  grossRupees: number,
  doctorCommissionPercent?: number | string | null,
  defaultCommissionPercent?: number | string | null,
): CommissionSplitResult {
  const commissionPercent = resolveCommissionPercent(
    doctorCommissionPercent,
    defaultCommissionPercent,
  );
  const safeGrossRupees = Number.isFinite(grossRupees) && grossRupees > 0 ? grossRupees : 0;
  const grossPaise = Math.round(safeGrossRupees * 100);
  const commissionPaise = Math.round((grossPaise * commissionPercent) / 100);
  const doctorNetPaise = grossPaise - commissionPaise;

  return {
    commissionPercent,
    grossPaise,
    commissionPaise,
    doctorNetPaise,
    grossAmount: grossPaise / 100,
    commissionAmount: commissionPaise / 100,
    doctorShare: doctorNetPaise / 100,
  };
}

export interface ServiceRecordForPricing {
  id: string;
  name?: string;
  price?: number | string | null;
  type?: string | null;
  active?: boolean | null;
}

export interface ServerPriceResolutionInput {
  appointmentType: "clinic" | "online";
  consultationFee: number | string | null | undefined;
  onlineFee?: number | string | null | undefined;
  service?: ServiceRecordForPricing | null;
}

export type ServerPriceResolutionResult =
  | { ok: true; serverPrice: number; serverPaise: number }
  | { ok: false; error: "INVALID_SERVICE" | "SERVICE_TYPE_MISMATCH" | "INVALID_PRICE"; message: string };

/**
 * Resolves the authoritative price in INR for a booking on the server.
 * - If a service is provided, validates it is active and compatible with
 *   `appointmentType` (`service.type === appointmentType || service.type === "both"`).
 *   Uses `Number(service.price) > 0 ? Number(service.price) : Number(consultationFee)`.
 * - If no service is provided, uses `onlineFee` (if > 0) for `"online"` appointments,
 *   falling back to `consultationFee`.
 */
export function resolveAuthoritativePrice(
  input: ServerPriceResolutionInput,
): ServerPriceResolutionResult {
  const baseConsultationFee = Number(input.consultationFee ?? 0);
  const onlineFee = Number(input.onlineFee ?? 0);

  if (input.service !== undefined && input.service !== null) {
    if (input.service.active === false) {
      return {
        ok: false,
        error: "INVALID_SERVICE",
        message: "The selected service is no longer active.",
      };
    }
    const sType = input.service.type || "both";
    if (sType !== "both" && sType !== input.appointmentType) {
      return {
        ok: false,
        error: "SERVICE_TYPE_MISMATCH",
        message: `This service is not available for ${input.appointmentType} consultations.`,
      };
    }
    const sPrice = Number(input.service.price ?? 0);
    const resolved = sPrice > 0 ? sPrice : baseConsultationFee;
    const serverPaise = Math.round(resolved * 100);
    if (serverPaise <= 0) {
      return {
        ok: false,
        error: "INVALID_PRICE",
        message: "This service does not have a valid consultation fee configured.",
      };
    }
    return { ok: true, serverPrice: serverPaise / 100, serverPaise };
  }

  const resolved =
    input.appointmentType === "online" && onlineFee > 0
      ? onlineFee
      : baseConsultationFee;
  const serverPaise = Math.round(resolved * 100);
  if (serverPaise <= 0) {
    return {
      ok: false,
      error: "INVALID_PRICE",
      message: "Consultation fee is not configured for this doctor.",
    };
  }
  return { ok: true, serverPrice: serverPaise / 100, serverPaise };
}

/**
 * Checks whether the client-submitted booking amount matches the server-resolved
 * authoritative price in integer paise.
 */
export function isAmountMatchingServerPrice(
  clientAmountRupees: number,
  serverPriceRupees: number,
): boolean {
  if (!Number.isFinite(clientAmountRupees) || !Number.isFinite(serverPriceRupees)) {
    return false;
  }
  return Math.round(clientAmountRupees * 100) === Math.round(serverPriceRupees * 100);
}
