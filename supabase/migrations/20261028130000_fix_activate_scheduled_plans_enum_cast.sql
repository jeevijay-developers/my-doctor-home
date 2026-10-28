-- 20261028120000 rewrote activate_scheduled_plans with a CASE that yields text,
-- but profiles.plan_status is an enum, so the UPDATE failed with 42804 and the
-- daily activation job would have rolled back. Cast both branches.
CREATE OR REPLACE FUNCTION public.activate_scheduled_plans()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pending_row RECORD;
BEGIN
  PERFORM set_config('app.plan_write_ok', 'on', true);
  FOR pending_row IN
    DELETE FROM public.pending_plans
    WHERE id IN (
      SELECT id FROM public.pending_plans
      WHERE activation_date <= now()
      ORDER BY activation_date
      FOR UPDATE SKIP LOCKED
    )
    RETURNING doctor_id, target_tier, payment_id, activation_date
  LOOP
    UPDATE public.profiles
    SET plan_tier = pending_row.target_tier,
        plan_status = CASE WHEN plan_status = 'cancelled'::public.plan_status
                           THEN 'cancelled'::public.plan_status
                           ELSE 'active'::public.plan_status END,
        plan_end = GREATEST(pending_row.activation_date, now() - interval '1 day') + interval '30 days'
    WHERE id = pending_row.doctor_id;

    INSERT INTO public.notifications (doctor_id, source_type, title, message)
    VALUES (
      pending_row.doctor_id,
      'direct_message',
      'Scheduled Plan Activated!',
      'Your ' || INITCAP(pending_row.target_tier) || ' plan is now active. Enjoy your upgraded features!'
    );

    INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, details)
    VALUES (
      NULL, 'scheduled_plan_activated', 'profiles', pending_row.doctor_id,
      jsonb_build_object('tier', pending_row.target_tier, 'payment_id', pending_row.payment_id, 'activated_at', now())
    );
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.activate_scheduled_plans() FROM PUBLIC, anon, authenticated;
