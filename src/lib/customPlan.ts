import { FEATURE_KEYS } from "@/lib/features";

// Mirrors public.doctor_custom_plans (see the custom_plan_requests migration).
// Deltas are relative to base_tier's defaults.
export type CustomPlan = {
  doctor_id: string;
  request_id: string | null;
  base_tier: string;
  extra_features: string[];
  removed_features: string[];
  monthly_price: number;
  valid_from: string;
  valid_until: string | null;
  status: "active" | "expired" | "cancelled";
};

export type PlanRequestStatus = "pending" | "approved" | "rejected" | "withdrawn";

export type PlanRequest = {
  id: string;
  doctor_id: string;
  base_tier: string;
  add_features: string[];
  remove_features: string[];
  doctor_note: string | null;
  status: PlanRequestStatus;
  reviewer_note: string | null;
  approved_features: string[] | null;
  approved_price: number | null;
  valid_from: string | null;
  valid_until: string | null;
  decided_at: string | null;
  created_at: string;
};

// Same rule the database applies lazily in doctor_active_custom_plan(): a plan
// stops applying the instant valid_until passes, even before the expiry cron runs.
export function isCustomPlanActive(plan: CustomPlan | null | undefined, now: Date = new Date()): plan is CustomPlan {
  if (!plan || plan.status !== "active") return false;
  if (new Date(plan.valid_from) > now) return false;
  if (plan.valid_until && new Date(plan.valid_until) <= now) return false;
  return true;
}

// A custom plan is built on ONE paid tier. Its price and feature changes apply only while
// the doctor is on that same tier (the pricing cards, the checkout and the database all use
// this rule), so "active" is not enough: it can be inside its dates yet not apply.
//   none          no custom plan inside its dates
//   applies       built on the tier the doctor is on: price and features are live
//   tier_mismatch inside its dates but built on a different tier: nothing changes for the doctor
export type CustomPlanApplication = "none" | "applies" | "tier_mismatch";
export function customPlanApplication(
  plan: CustomPlan | null | undefined,
  currentTier: string | null | undefined,
  now: Date = new Date(),
): CustomPlanApplication {
  if (!isCustomPlanActive(plan, now)) return "none";
  return plan.base_tier === currentTier ? "applies" : "tier_mismatch";
}

// Which static card bullet describes which gated feature, so a custom plan can
// add/remove the matching line instead of the card lying about what's included.
export const FEATURE_BULLETS: Record<string, string> = {
  [FEATURE_KEYS.AI_BLOG_WRITER]: "AI blog writer",
  [FEATURE_KEYS.BILLING_INVOICES]: "Billing & invoices",
  [FEATURE_KEYS.ONLINE_CONSULTATION]: "Online consultation",
  [FEATURE_KEYS.PATIENT_RECORDS]: "Patient records",
  [FEATURE_KEYS.STAFF_MANAGEMENT]: "Staff roles & access",
};

export type CardBullet = { text: string; kind: "base" | "added" | "removed" };

// Applies an active custom plan to the card of ITS base tier only; the other
// tier's card keeps the standard content.
export function applyCustomPlanToBullets(
  bullets: string[],
  plan: CustomPlan | null | undefined,
  tier: string,
  labelFor: (key: string) => string = (k) => FEATURE_BULLETS[k] ?? k,
): CardBullet[] {
  const base: CardBullet[] = bullets.map((text) => ({ text, kind: "base" }));
  if (!isCustomPlanActive(plan) || plan.base_tier !== tier) return base;

  const removedTexts = new Set(plan.removed_features.map((k) => FEATURE_BULLETS[k]).filter(Boolean));
  const kept = base.filter((b) => !removedTexts.has(b.text));
  const already = new Set(kept.map((b) => b.text));
  const added: CardBullet[] = plan.extra_features
    .filter((k) => !already.has(FEATURE_BULLETS[k] ?? ""))
    .map((k) => ({ text: labelFor(k), kind: "added" as const }));
  const removed: CardBullet[] = plan.removed_features.map((k) => ({ text: labelFor(k), kind: "removed" as const }));
  return [...kept, ...added, ...removed];
}

// Diff of a request against what the doctor currently has, for display.
export function describeRequest(r: Pick<PlanRequest, "add_features" | "remove_features">, labelFor: (key: string) => string) {
  return {
    adding: r.add_features.map(labelFor),
    removing: r.remove_features.map(labelFor),
  };
}

// Toggle state -> add/remove arrays for submit_plan_request. `current` is the
// set of keys effective right now; `desired` is what the doctor ticked.
export function diffFeatureSelection(current: Set<string>, desired: Set<string>, requestableKeys: string[]) {
  const add: string[] = [];
  const remove: string[] = [];
  for (const key of requestableKeys) {
    if (desired.has(key) && !current.has(key)) add.push(key);
    if (!desired.has(key) && current.has(key)) remove.push(key);
  }
  return { add, remove };
}
