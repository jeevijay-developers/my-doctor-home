import { customPlanApplication, type CustomPlan } from "./customPlan";

// One place that answers "which plan group is this doctor in right now?" for the
// superadmin Subscriptions screen. It trusts the dates, not just plan_status:
// the nightly job that flips a lapsed plan to 'expired' can lag, and a doctor
// whose end date has passed must already read as expired here.

export type PlanBucket = "active_paid" | "trial" | "free" | "expired" | "suspended";
export type PlanView = "all" | "pro" | "premium" | "custom" | "trial" | "free" | "expiring" | "expired" | "suspended";

export const EXPIRING_SOON_DAYS = 7;
const DAY = 86_400_000;

export type PlanRow = {
  plan_tier?: string | null;
  plan_status?: string | null;
  trial_end?: string | null;
  plan_end?: string | null;
  custom_plan_price?: number | null;
};

export type ClassifiedPlan = {
  bucket: PlanBucket;
  tier: "free" | "pro" | "premium";
  /** Paying (or about to pay) a negotiated price: an approved custom plan that applies, or a manual override. */
  isCustom: boolean;
  /** Active paid plan or running trial that ends within EXPIRING_SOON_DAYS. */
  expiringSoon: boolean;
  endsAt: Date | null;
  /** Whole days until the end, rounded up; negative or 0 once it has ended. Null when there is no end date. */
  daysLeft: number | null;
};

const asTier = (t: string | null | undefined): ClassifiedPlan["tier"] => (t === "pro" || t === "premium" ? t : "free");

export function classifyPlan(row: PlanRow, customPlan?: CustomPlan | null, now: Date = new Date()): ClassifiedPlan {
  const tier = asTier(row.plan_tier);
  const status = row.plan_status ?? null;

  // A running trial ends at trial_end; a paid plan at plan_end. An expired free-tier doctor has
  // no plan_end, so fall back to the trial end so "when did it end?" is still answerable.
  const endIso = status === "trial" ? row.trial_end : row.plan_end ?? (tier === "free" ? row.trial_end : null);
  const endsAt = endIso ? new Date(endIso) : null;
  const msLeft = endsAt ? endsAt.getTime() - now.getTime() : null;
  const daysLeft = msLeft == null ? null : Math.ceil(msLeft / DAY);

  let bucket: PlanBucket;
  if (status === "cancelled") bucket = "suspended";
  else if (status === "expired" || (msLeft != null && msLeft <= 0 && (status === "trial" || status === "active"))) bucket = "expired";
  else if (status === "trial") bucket = "trial";
  else if (tier === "free") bucket = "free";
  else bucket = "active_paid";

  const isCustom =
    bucket === "active_paid" &&
    (customPlanApplication(customPlan, tier, now) === "applies" || row.custom_plan_price != null);
  const expiringSoon =
    (bucket === "active_paid" || bucket === "trial") && daysLeft != null && daysLeft <= EXPIRING_SOON_DAYS;

  return { bucket, tier, isCustom, expiringSoon, endsAt, daysLeft };
}

export function matchesView(c: ClassifiedPlan, view: PlanView): boolean {
  switch (view) {
    case "all": return true;
    case "pro": return c.bucket === "active_paid" && c.tier === "pro";
    case "premium": return c.bucket === "active_paid" && c.tier === "premium";
    case "custom": return c.isCustom;
    case "trial": return c.bucket === "trial";
    case "free": return c.bucket === "free";
    case "expiring": return c.expiringSoon;
    case "expired": return c.bucket === "expired";
    case "suspended": return c.bucket === "suspended";
  }
}

export function countByView(list: ClassifiedPlan[]): Record<PlanView, number> {
  const views: PlanView[] = ["all", "pro", "premium", "custom", "trial", "free", "expiring", "expired", "suspended"];
  return Object.fromEntries(views.map((v) => [v, list.filter((c) => matchesView(c, v)).length])) as Record<PlanView, number>;
}

/** "in 5 days", "today", "3 days ago" for the Expiry column. */
export function describeExpiry(c: ClassifiedPlan): string {
  if (c.daysLeft == null) return "";
  if (c.bucket === "expired") {
    // Flagged expired while the stored date is still ahead: no honest relative text.
    if (c.daysLeft > 0) return "";
    if (c.daysLeft === 0) return "today";
    return c.daysLeft === -1 ? "1 day ago" : `${Math.abs(c.daysLeft)} days ago`;
  }
  if (c.daysLeft > 1) return `in ${c.daysLeft} days`;
  if (c.daysLeft === 1) return "tomorrow";
  return "today";
}
