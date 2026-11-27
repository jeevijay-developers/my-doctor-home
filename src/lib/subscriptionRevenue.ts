import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { DEFAULT_PLAN_PRICES } from "@/lib/planPrices";
import { isCustomPlanActive, type CustomPlan } from "@/lib/customPlan";

// When live DB prices are available, callers should pass them as the second
// argument.  The static fallback keeps tests and legacy call sites working.

export type PaymentTxnStatus = "created" | "authorized" | "captured" | "failed" | "refunded" | "abandoned";
export type PaymentStatusBucket = "Paid" | "Pending" | "Failed" | "Refunded" | "Abandoned";

export const bucketPaymentStatus = (status: PaymentTxnStatus): PaymentStatusBucket => {
  switch (status) {
    case "captured":
      return "Paid";
    case "created":
    case "authorized":
      return "Pending";
    case "failed":
      return "Failed";
    case "refunded":
      return "Refunded";
    case "abandoned":
      return "Abandoned";
  }
};

export interface UpgradePayment {
  amount: number;
  status: PaymentTxnStatus;
  created_at: string;
  /** Money was taken but the purchase could not be applied: not revenue until resolved. */
  needs_refund?: boolean | null;
}

export interface RevenueTotals {
  today: number;
  week: number;
  month: number;
}

export const computeRevenueTotals = (payments: UpgradePayment[], now: Date = new Date()): RevenueTotals => {
  const captured = payments.filter((p) => p.status === "captured" && !p.needs_refund);
  const sumInRange = (start: Date, end: Date) =>
    captured
      .filter((p) => {
        const d = new Date(p.created_at);
        return d >= start && d <= end;
      })
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  return {
    today: sumInRange(startOfDay(now), endOfDay(now)),
    week: sumInRange(startOfWeek(now), endOfWeek(now)),
    month: sumInRange(startOfMonth(now), endOfMonth(now)),
  };
};

export interface SubscriberProfile {
  id?: string;
  plan_status: string | null;
  plan_tier: string | null;
  custom_plan_price: number | null;
  plan_end?: string | null;
}

type SeatPeriodPayment = { unit_price: number | null; is_mock?: boolean | null };

/** A purchased-seat period with the payment's unit price embedded (clinic_seat_periods + plan_upgrade_payments). */
export interface SeatPeriodRow {
  quantity: number;
  starts_at: string;
  ends_at: string;
  plan_upgrade_payments?: SeatPeriodPayment | SeatPeriodPayment[] | null;
}

/** Monthly value of the seat periods that are running at `now`. */
export const seatPeriodsMonthly = (periods: SeatPeriodRow[], now: Date = new Date()): number =>
  periods.reduce((sum, p) => {
    if (new Date(p.starts_at) > now || new Date(p.ends_at) <= now) return sum;
    const pay = Array.isArray(p.plan_upgrade_payments) ? p.plan_upgrade_payments[0] : p.plan_upgrade_payments;
    // Test-mode payments are not income, and a period without a recorded unit price is unknown
    // (skipped, not counted as 0 silently).
    if (!pay || pay.is_mock || pay.unit_price == null) return sum;
    return sum + Number(p.quantity || 0) * Number(pay.unit_price);
  }, 0);

/** "Plan", "Plan + 2 seats" or "Doctor seats ×3" for the superadmin payment lists. */
export const paymentKindLabel = (kind: string | null | undefined, seats: number | null | undefined): string => {
  const n = Number(seats ?? 0);
  if (kind === "seats") return n > 0 ? `Doctor seats ×${n}` : "Doctor seats";
  return n > 0 ? `Plan + ${n} seat${n === 1 ? "" : "s"}` : "Plan";
};

// Same price precedence checkout uses: an approved custom plan (for the tier it
// was approved on) > the doctor's manual custom price > the platform default.
// Doctors whose paid period has already ended are not recurring revenue.
export const computeEstimatedMRR = (
  profiles: SubscriberProfile[],
  defaultPrices: Record<string, number> = DEFAULT_PLAN_PRICES,
  customPlans: Map<string, CustomPlan> = new Map(),
  now: Date = new Date(),
  seatPeriods: SeatPeriodRow[] = [],
): number =>
  seatPeriodsMonthly(seatPeriods, now) +
  profiles
    .filter((p) => p.plan_status === "active" && (p.plan_tier === "pro" || p.plan_tier === "premium"))
    .filter((p) => !p.plan_end || new Date(p.plan_end) > now)
    .reduce((sum, p) => {
      const plan = p.id ? customPlans.get(p.id) : undefined;
      if (isCustomPlanActive(plan, now) && plan.base_tier === p.plan_tier) {
        return sum + Number(plan.monthly_price);
      }
      return sum + (p.custom_plan_price ?? defaultPrices[p.plan_tier || "free"] ?? 0);
    }, 0);
