-- "free" is only ever the tier of a doctor on the 7-day trial (sign-up creates
-- plan_tier = 'free', plan_status = 'trial'). There is no free plan.
--
-- The superadmin "Change Tier" dropdowns used to offer "free" and set
-- plan_status = 'active' when it was picked, leaving doctors on the free tier
-- with an 'active' status, no trial and no end date: a state that is neither a
-- running trial nor a paid plan. The dropdowns no longer offer it; this clears
-- the rows already in that state.
--
--   * trial_end still in the future -> back to 'trial', so a trial that was
--     cut short by the old dropdown runs for the days it had left.
--   * otherwise                     -> 'expired' (no plan, no trial). A
--     superadmin can extend the trial or move them to Pro/Premium from the
--     Subscriptions page.
--
-- Only plan_tier = 'free' AND plan_status = 'active' rows are touched, so no
-- paid, custom, suspended or already-expired account can be affected. Re-running
-- it is a no-op.

UPDATE public.profiles
SET plan_status = CASE
      WHEN trial_end IS NOT NULL AND trial_end > now() THEN 'trial'::public.plan_status
      ELSE 'expired'::public.plan_status
    END
WHERE COALESCE(plan_tier, 'free') = 'free'
  AND plan_status = 'active';
