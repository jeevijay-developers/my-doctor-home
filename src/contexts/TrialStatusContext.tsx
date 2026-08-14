import { createContext, useContext, ReactNode } from "react";

export type TrialAccessLevel = "full" | "grace" | "blocked";

const GRACE_PERIOD_HOURS = 48;

export interface TrialStatus {
  accessLevel: TrialAccessLevel;
  isStaff: boolean;
  /** Only meaningful when accessLevel === "grace" — when the hard block starts. */
  graceEndsAt: Date | null;
}

const TrialStatusContext = createContext<TrialStatus>({
  accessLevel: "full",
  isStaff: false,
  graceEndsAt: null,
});

export const TrialStatusProvider = ({ value, children }: { value: TrialStatus; children: ReactNode }) => (
  <TrialStatusContext.Provider value={value}>{children}</TrialStatusContext.Provider>
);

export const useTrialStatus = () => useContext(TrialStatusContext);

// Derives access level from plan_status + trial_end — no separate "grace"
// enum value in the DB. trial_end is fixed once set (the expiry cron only
// flips plan_status, never touches trial_end again), so the grace window
// is always computable from these two fields directly.
export function computeTrialAccess(planStatus: string | null | undefined, trialEnd: string | null | undefined): TrialAccessLevel {
  if (planStatus === "cancelled") return "blocked";
  if (planStatus !== "expired") return "full";
  if (!trialEnd) return "blocked";
  const graceEndsAt = new Date(new Date(trialEnd).getTime() + GRACE_PERIOD_HOURS * 60 * 60 * 1000);
  return new Date() < graceEndsAt ? "grace" : "blocked";
}

export function graceEndsAtFrom(trialEnd: string | null | undefined): Date | null {
  if (!trialEnd) return null;
  return new Date(new Date(trialEnd).getTime() + GRACE_PERIOD_HOURS * 60 * 60 * 1000);
}
