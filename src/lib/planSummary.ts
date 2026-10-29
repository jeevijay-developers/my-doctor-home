import { formatIstDate, istDayKey } from "@/lib/istDate";

// "free" is a real tier here (a doctor can be on it); it must never read as "Pro".
export const planTierName = (tier: string | null | undefined): string =>
  ({ free: "Free", pro: "Pro", premium: "Premium" } as Record<string, string>)[tier ?? ""] ?? (tier ?? "");

// One answer to "what plan am I on and when does it end?", shared by the header chip, the
// dashboard card and anything else that needs it, so the wording and the day count can
// never disagree between screens.
export type PlanSummaryKind = "trial" | "paid" | "expired" | "suspended" | "unknown";
export type PlanUrgency = "ok" | "soon" | "critical" | "ended";

export type PlanSummary = {
  kind: PlanSummaryKind;
  tierLabel: string;
  endsAt: Date | null;
  /** Whole days left, rounded up (23 hours left = 1 day). Null when there is no end date. */
  daysLeft: number | null;
  endsToday: boolean;
  urgency: PlanUrgency;
  /** Short text for the header chip. */
  chip: string;
  /** Even shorter, for narrow screens: "30d", "Today", "Ended", "Suspended". */
  short: string;
  /** One sentence for tooltips and cards. */
  detail: string;
};

type PlanFields = {
  plan_tier?: string | null;
  plan_status?: string | null;
  trial_end?: string | null;
  plan_end?: string | null;
};

const DAY = 86_400_000;
const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

export function summarizePlan(p: PlanFields | null | undefined, now: Date = new Date()): PlanSummary {
  if (!p || !p.plan_status) {
    return { kind: "unknown", tierLabel: "", endsAt: null, daysLeft: null, endsToday: false, urgency: "ok", chip: "", short: "", detail: "" };
  }

  const status = p.plan_status;
  const tierLabel = planTierName(p.plan_tier);
  const endIso = status === "trial" ? p.trial_end : p.plan_end;
  const endsAt = endIso ? new Date(endIso) : null;
  const msLeft = endsAt ? endsAt.getTime() - now.getTime() : null;
  const daysLeft = msLeft == null ? null : Math.max(0, Math.ceil(msLeft / DAY));
  // "Today" is the clinic's (IST) calendar day, not a rolling 24 hours.
  const endsToday = msLeft != null && msLeft > 0 && istDayKey(endsAt!) === istDayKey(now);
  const endDate = endsAt ? formatIstDate(endsAt) : "";

  if (status === "cancelled") {
    return { kind: "suspended", tierLabel, endsAt, daysLeft, endsToday: false, urgency: "ended", chip: "Account suspended", short: "Suspended", detail: "This account is suspended. Please contact support." };
  }

  if (status === "expired" || (msLeft != null && msLeft <= 0)) {
    const what = status === "trial" || (status === "expired" && !p.plan_end) ? "Free trial" : `${tierLabel} plan`;
    return {
      kind: "expired", tierLabel, endsAt, daysLeft: 0, endsToday: false, urgency: "ended",
      chip: `${what} ended`,
      short: "Ended",
      detail: `Your ${what.toLowerCase()} ended${endDate ? ` on ${endDate}` : ""}. Renew to keep editing.`,
    };
  }

  const urgency: PlanUrgency = daysLeft == null ? "ok" : daysLeft <= 3 ? "critical" : daysLeft <= 7 ? "soon" : "ok";
  const left = endsToday ? "ends today" : daysLeft == null ? "" : `${days(daysLeft)} left`;

  if (status === "trial") {
    return {
      kind: "trial", tierLabel: "Free trial", endsAt, daysLeft, endsToday, urgency,
      chip: `Free trial${left ? ` · ${left}` : ""}`,
      short: endsToday ? "Today" : daysLeft == null ? "Trial" : `${daysLeft}d`,
      detail: endsAt ? `Your free trial ends on ${endDate} (${endsToday ? "today" : days(daysLeft ?? 0) + " left"}).` : "You are on a free trial.",
    };
  }

  return {
    kind: "paid", tierLabel, endsAt, daysLeft, endsToday, urgency,
    chip: `${tierLabel}${left ? ` · ${left}` : ""}`,
    short: endsToday ? "Today" : daysLeft == null ? tierLabel : `${daysLeft}d`,
    detail: endsAt
      ? `Your ${tierLabel} plan is active until ${endDate} (${endsToday ? "ends today" : days(daysLeft ?? 0) + " left"}).`
      : `Your ${tierLabel} plan is active.`,
  };
}
