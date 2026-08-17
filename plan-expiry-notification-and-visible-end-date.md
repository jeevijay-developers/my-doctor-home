# Feature: Plan Expiry Notification (7 Days Prior) + Visible Plan End Date

## Context
This is a smaller, focused addition on top of work already speced/built this session:
- The **notification bell infrastructure** (from the "Superadmin → Doctor Messaging" ticket) already exists as the delivery mechanism — reuse it, don't build a second notification path.
- The **trial-expiry warning notifications** (from the "Plan Enforcement" ticket) already cover the free-trial case at 3-day/1-day thresholds. This ticket is the equivalent for **paid plan (Pro/Premium) billing period expiry** — i.e., when a doctor's current paid subscription period is about to end, not the trial.
- The **plan end date field** (`current_period_ends_at` or equivalent — confirm actual column name on `profiles`) already exists in the schema per earlier work (referenced in the Advance/Scheduled Subscription Purchase spec).

## Task

### 1. 7-day-prior expiry notification
- Add a scheduled check (extend the same daily cron/scheduled job used for trial-expiry warnings and scheduled-plan activation, if one already exists from earlier work — don't create a second separate cron job for this) that finds all doctors on a **paid** plan (Pro or Premium) where `current_period_ends_at` is exactly 7 days away (or "within 7 days" if the job doesn't run precisely once a day at a consistent time — use a date-range check like `current_period_ends_at BETWEEN now() AND now() + interval '7 days'` combined with a "has this warning already been sent for this period" flag, so the same doctor doesn't get the same warning repeated daily for a week).
- Send a notification via the existing notification bell system: something like *"Your [Pro/Premium] plan ends on [date]. Renew now to avoid any interruption."*
- The notification should deep-link to the Settings → Subscription page (or directly trigger the renewal flow) so the doctor can act on it immediately.
- **Do not** send this notification to a doctor who already has a scheduled renewal/plan-change queued (from the Advance/Scheduled Subscription Purchase feature) for that same period-end date — if they've already paid ahead, warning them their plan is "ending" would be confusing/incorrect. Check for a pending `scheduled_plan_tier` before sending.

### 2. Visible plan end date on the doctor's Settings page
- On `/admin/settings` → Subscription tab, the current plan card (currently shows "Active Plan (Premium)" with no date, per the existing screenshot) should also display the **plan end/renewal date** clearly — e.g. "Active Plan (Premium) — renews/ends [date]."
- If the doctor has a scheduled plan change queued (per the earlier Advance/Scheduled Subscription Purchase feature), also show that here for consistency (e.g. "Current: Premium, active until Aug 30 — Pro scheduled to start Aug 30") rather than just the current plan in isolation.
- Confirm this date is pulled from the same `current_period_ends_at`-type field used by the notification job in part 1, so the displayed date and the date that triggers the warning notification never disagree.

## Acceptance Criteria
- [ ] Doctors on a paid plan receive a notification (via the existing bell system) exactly once, approximately 7 days before their plan's period-end date.
- [ ] The notification is not repeated daily for the same period-end date (deduplication via a "sent" flag or equivalent).
- [ ] Doctors with an already-scheduled renewal/plan-change for that period-end date do not receive this warning (since it would be misleading).
- [ ] The Settings → Subscription page clearly displays the current plan's end/renewal date.
- [ ] If a scheduled plan change is pending, it's shown alongside the current plan's end date for clarity.
- [ ] The date shown on the Settings page and the date used to trigger the 7-day warning are sourced from the same field, guaranteed to never disagree.
