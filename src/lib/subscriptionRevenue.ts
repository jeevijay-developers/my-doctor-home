import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { DEFAULT_PLAN_PRICES } from "@/components/superadmin/SASubscriptions";

export type PaymentTxnStatus = "created" | "authorized" | "captured" | "failed" | "refunded";
export type PaymentStatusBucket = "Paid" | "Pending" | "Failed" | "Refunded";

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
  }
};

export interface UpgradePayment {
  amount: number;
  status: PaymentTxnStatus;
  created_at: string;
}

export interface RevenueTotals {
  today: number;
  week: number;
  month: number;
}

export const computeRevenueTotals = (payments: UpgradePayment[], now: Date = new Date()): RevenueTotals => {
  const captured = payments.filter((p) => p.status === "captured");
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
  plan_status: string | null;
  plan_tier: string | null;
  custom_plan_price: number | null;
}

export const computeEstimatedMRR = (profiles: SubscriberProfile[]): number =>
  profiles
    .filter((p) => p.plan_status === "active" && (p.plan_tier === "pro" || p.plan_tier === "premium"))
    .reduce((sum, p) => sum + (p.custom_plan_price ?? DEFAULT_PLAN_PRICES[p.plan_tier || "free"] ?? 0), 0);
