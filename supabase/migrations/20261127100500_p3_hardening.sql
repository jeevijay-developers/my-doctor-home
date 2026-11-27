-- Multi-doctor P3 hardening (from the adversarial reviews of the P3 migrations).
--
--  1. Seat orders: the quote charges at most 30 days and returns the matching period_end; the apply
--     function honours the STORED order terms (never prof.plan_end, never beyond what was paid) and
--     rejects an expired order or a plan that was shortened since the quote.
--  2. A payment that is not applied stays visible: plan_upgrade_payments.needs_refund (+ reason), an
--     owner notification (can never fail the payment function), and an honest "captured" replay.
--  3. Renewal seats: renewal_seats_check() for the order endpoint, and the renewal clamp counts
--     active + scheduled periods and flags what it could not apply.
--  4. A scheduled renewal's seat period follows the plan when a superadmin moves plan_end.
--  5. Superadmin launch settings: validation, audit trigger, set_multi_doctor_settings().
--  6. Reviews: length limits and an hourly throttle for visitors.
--  7. Revenue counts an invoice in the period it was issued (refunds stay in the period refunded).
--  8. Directory: one view the planner can push the city/specialty filters into.
--  9. Services mapped only to deactivated doctors behave as unmapped; anonymous bookings cannot pick
--     a doctor who does not offer the service.
-- 10. Index for the daily clinical_access_log purge.

-- 0. Columns / index ------------------------------------------------------------------------------
ALTER TABLE public.plan_upgrade_payments
  ADD COLUMN IF NOT EXISTS needs_refund boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_refund_reason text;

CREATE INDEX IF NOT EXISTS idx_clinical_access_log_created ON public.clinical_access_log (created_at);

-- 1. The quote: charge for min(days_left, 30) and return the period that was paid for. -------------
CREATE OR REPLACE FUNCTION public.seat_order_quote(_doctor_id uuid, _qty integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  prof      public.profiles%ROWTYPE;
  v_val     jsonb;
  v_price   numeric;
  v_days    numeric;
  v_total   numeric;
  v_end     timestamptz;
  v_max     integer := public.platform_int_setting('doctor_seat_max', 15);
  v_granted integer;
  v_active  integer;
  v_amount  numeric;
BEGIN
  SELECT * INTO prof FROM public.profiles WHERE id = _doctor_id;
  IF NOT FOUND OR NOT COALESCE(public.clinic_multi_doctor_enabled(_doctor_id), false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_ENABLED');
  END IF;

  SELECT value INTO v_val FROM public.platform_settings WHERE key = 'doctor_seat_price';
  IF v_val IS NULL OR jsonb_typeof(v_val) <> 'number' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PRICE_NOT_SET');
  END IF;
  v_price := (v_val #>> '{}')::numeric;
  IF v_price <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PRICE_NOT_SET');
  END IF;

  IF NOT (prof.plan_tier = 'premium' AND prof.plan_status = 'active'
          AND prof.plan_end IS NOT NULL AND prof.plan_end > now() + interval '1 hour') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PLAN_NOT_ELIGIBLE');
  END IF;

  -- Checked before any arithmetic: granted + active + _qty would overflow an integer.
  IF _qty IS NULL OR _qty < 1 OR _qty > 1000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_QTY');
  END IF;

  v_granted := COALESCE((SELECT extra_seats FROM public.clinic_doctor_seats WHERE doctor_id = _doctor_id), 0);
  v_active  := COALESCE((SELECT sum(quantity)::integer FROM public.clinic_seat_periods
                          WHERE doctor_id = _doctor_id AND starts_at <= now() AND ends_at > now()), 0);
  IF v_granted + v_active + _qty > v_max - 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SEAT_MAX');
  END IF;

  -- The period is what is charged for: never longer than 30 days, never past plan_end.
  v_end    := LEAST(prof.plan_end, now() + interval '30 days');
  v_days   := extract(epoch FROM (v_end - now())) / 86400;
  v_total  := extract(epoch FROM (prof.plan_end - now())) / 86400;
  v_amount := GREATEST(100, ceil(_qty * v_price * 100 * v_days / 30));
  RETURN jsonb_build_object(
    'ok', true,
    'amount_paise', v_amount::bigint,
    'unit_price', v_price,
    'days_left', round(v_total, 4),
    'charged_days', round(v_days, 4),
    'period_end', v_end
  );
END;
$$;
REVOKE ALL ON FUNCTION public.seat_order_quote(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seat_order_quote(uuid, integer) TO service_role;

-- 2. Making "not applied" visible --------------------------------------------------------------------
-- Internal: flag a captured payment for a manual refund and tell the clinic owner. The notification
-- is best effort: no failure in here may ever fail the payment function that calls it.
CREATE OR REPLACE FUNCTION public.flag_payment_needs_refund(_payment_id uuid, _reason text, _message text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_doc uuid;
BEGIN
  UPDATE public.plan_upgrade_payments
     SET needs_refund = true, needs_refund_reason = _reason
   WHERE id = _payment_id
  RETURNING doctor_id INTO v_doc;
  IF v_doc IS NULL THEN
    RETURN;
  END IF;
  BEGIN
    INSERT INTO public.notifications (doctor_id, recipient_user_id, source_type, title, message)
    VALUES (v_doc, v_doc, 'plan_warning', 'A seat payment needs attention', _message);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.flag_payment_needs_refund(uuid, text, text) FROM PUBLIC, anon, authenticated;

-- 3. Renewal seats --------------------------------------------------------------------------------------
-- The order endpoint asks this before it adds seats to a renewal order.
CREATE OR REPLACE FUNCTION public.renewal_seats_check(_doctor_id uuid, _qty integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_val     jsonb;
  v_price   numeric;
  v_max     integer := public.platform_int_setting('doctor_seat_max', 15);
  v_granted integer;
  v_periods integer;
BEGIN
  IF NOT COALESCE(public.clinic_multi_doctor_enabled(_doctor_id), false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_ENABLED');
  END IF;
  SELECT value INTO v_val FROM public.platform_settings WHERE key = 'doctor_seat_price';
  IF v_val IS NULL OR jsonb_typeof(v_val) <> 'number' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PRICE_NOT_SET');
  END IF;
  v_price := (v_val #>> '{}')::numeric;
  IF v_price <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PRICE_NOT_SET');
  END IF;
  IF _qty IS NULL OR _qty < 1 OR _qty > 1000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_QTY');
  END IF;
  v_granted := COALESCE((SELECT extra_seats FROM public.clinic_doctor_seats WHERE doctor_id = _doctor_id), 0);
  -- Active AND scheduled (not yet started) periods: a renewal's seats are bought on top of those.
  v_periods := COALESCE((SELECT sum(quantity)::integer FROM public.clinic_seat_periods
                          WHERE doctor_id = _doctor_id AND ends_at > now()), 0);
  IF v_granted + v_periods + _qty > v_max - 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SEAT_MAX');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.renewal_seats_check(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renewal_seats_check(uuid, integer) TO service_role;

-- Seats bought inside a renewal order. Internal. Returns true when it had to clamp or decline.
DROP FUNCTION IF EXISTS public.grant_renewal_seat_period(uuid, uuid, integer, timestamptz);
CREATE FUNCTION public.grant_renewal_seat_period(_payment_id uuid, _doctor_id uuid, _qty integer, _starts_at timestamptz)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_room    integer;
  v_qty     integer;
  v_clamped boolean := false;
BEGIN
  IF _qty IS NULL OR _qty < 1 THEN
    RETURN false;
  END IF;
  -- Room = max - 1 - granted - every period that has not ended (active AND scheduled).
  v_room := GREATEST(0, public.platform_int_setting('doctor_seat_max', 15) - 1
                        - COALESCE((SELECT extra_seats FROM public.clinic_doctor_seats WHERE doctor_id = _doctor_id), 0)
                        - COALESCE((SELECT sum(quantity)::integer FROM public.clinic_seat_periods
                                     WHERE doctor_id = _doctor_id AND ends_at > now()), 0));
  v_qty := LEAST(_qty, v_room);
  IF v_qty < _qty THEN
    v_clamped := true;
    INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, details)
    VALUES (NULL, 'renewal_seats_clamped', 'plan_upgrade_payments', _payment_id,
      jsonb_build_object('doctor_id', _doctor_id, 'ordered', _qty, 'applied', v_qty));
    PERFORM public.flag_payment_needs_refund(_payment_id, 'renewal_seats_clamped',
      'Your renewal included extra doctor seats, but not all of them could be added to your clinic. We will refund the difference or help you buy them again.');
  END IF;
  IF v_qty < 1 THEN
    RETURN v_clamped;
  END IF;
  INSERT INTO public.clinic_seat_periods (doctor_id, quantity, starts_at, ends_at, payment_id)
  VALUES (_doctor_id, v_qty, _starts_at, _starts_at + interval '30 days', _payment_id)
  ON CONFLICT (payment_id) DO NOTHING;
  RETURN v_clamped;
END;
$$;
REVOKE ALL ON FUNCTION public.grant_renewal_seat_period(uuid, uuid, integer, timestamptz) FROM PUBLIC, anon, authenticated;

-- 4. apply_plan_upgrade_payment: live body (20261127100000) + the order terms, needs_refund and the
--    renewal-seat flags. Plain plan payments take exactly the old path.
CREATE OR REPLACE FUNCTION public.apply_plan_upgrade_payment(_payment_id uuid, _razorpay_payment_id text, _signature text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  pay public.plan_upgrade_payments%ROWTYPE;
  prof public.profiles%ROWTYPE;
  v_old_payment uuid;
  v_reason text;
  v_qty integer;
  v_seats integer;
  v_clamped boolean := false;
BEGIN
  SELECT * INTO pay FROM public.plan_upgrade_payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  SELECT * INTO prof FROM public.profiles WHERE id = pay.doctor_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'doctor_not_found');
  END IF;

  IF pay.status = 'captured' THEN
    IF pay.kind = 'seats' THEN
      -- "Applied" only if the seats actually exist; a captured payment that was not applied
      -- stays an open refund, never a success.
      IF EXISTS (SELECT 1 FROM public.clinic_seat_periods WHERE payment_id = pay.id) THEN
        RETURN jsonb_build_object('ok', true, 'already_verified', true, 'plan_tier', COALESCE(prof.plan_tier, pay.target_tier), 'kind', 'seats');
      END IF;
      RETURN jsonb_build_object('ok', false, 'code', 'not_applied', 'kind', 'seats', 'needs_refund', true);
    END IF;
    RETURN jsonb_build_object('ok', true, 'already_verified', true, 'plan_tier', COALESCE(prof.plan_tier, pay.target_tier));
  END IF;
  IF pay.status NOT IN ('created', 'failed', 'abandoned') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_payable', 'status', pay.status);
  END IF;

  BEGIN
    UPDATE public.plan_upgrade_payments
    SET status = 'captured',
        razorpay_payment_id = _razorpay_payment_id,
        razorpay_signature = COALESCE(_signature, razorpay_signature),
        updated_at = now()
    WHERE id = pay.id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'code', 'payment_reused');
  END;

  PERFORM set_config('app.plan_write_ok', 'on', true);

  -- Extra doctor seats: re-check everything inside the lock. If the order is stale, the plan lapsed,
  -- was cancelled or shortened, the feature was switched off or the cap was reached between order
  -- and capture, the money is recorded, flagged needs_refund and the owner is told.
  IF pay.kind = 'seats' THEN
    v_qty := COALESCE(pay.seats_quantity, 0);
    v_reason := CASE
      WHEN prof.plan_status = 'cancelled' THEN 'cancelled'
      WHEN NOT (prof.plan_tier = 'premium' AND prof.plan_status = 'active'
                AND prof.plan_end IS NOT NULL AND prof.plan_end > now()) THEN 'plan_lapsed'
      WHEN NOT COALESCE(public.clinic_multi_doctor_enabled(pay.doctor_id), false) THEN 'not_enabled'
      WHEN v_qty < 1 THEN 'invalid_qty'
      WHEN pay.period_end IS NULL OR pay.period_end <= now() THEN 'order_expired'
      WHEN prof.plan_end < pay.period_end - interval '60 seconds' THEN 'plan_changed'
      WHEN COALESCE((SELECT extra_seats FROM public.clinic_doctor_seats WHERE doctor_id = pay.doctor_id), 0)
           + COALESCE((SELECT sum(quantity)::integer FROM public.clinic_seat_periods
                        WHERE doctor_id = pay.doctor_id AND starts_at <= now() AND ends_at > now()), 0)
           + v_qty > public.platform_int_setting('doctor_seat_max', 15) - 1 THEN 'cap_exceeded'
    END;
    IF v_reason IS NOT NULL THEN
      INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, details)
      VALUES (NULL, 'seat_payment_not_applied_' || v_reason, 'plan_upgrade_payments', pay.id,
        jsonb_build_object('doctor_id', pay.doctor_id, 'seats', v_qty, 'amount', pay.amount));
      PERFORM public.flag_payment_needs_refund(pay.id, v_reason,
        'We received your payment for extra doctor seats, but the seats could not be added to your clinic. We will refund the payment or help you buy the seats again.');
      RETURN jsonb_build_object('ok', false, 'code', v_reason, 'kind', 'seats', 'needs_refund', true);
    END IF;
    -- The period is exactly what was ordered and paid for: [now, the order's period_end).
    INSERT INTO public.clinic_seat_periods (doctor_id, quantity, starts_at, ends_at, payment_id)
    VALUES (pay.doctor_id, v_qty, now(), pay.period_end, pay.id);
    RETURN jsonb_build_object('ok', true, 'kind', 'seats', 'plan_tier', prof.plan_tier,
      'seats_quantity', v_qty, 'period_end', pay.period_end,
      'seat_limit', public.clinic_doctor_seat_limit(pay.doctor_id));
  END IF;

  -- A suspended doctor cannot buy their way out of suspension; the money is
  -- recorded and flagged for manual refund instead.
  IF prof.plan_status = 'cancelled' THEN
    INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, details)
    VALUES (NULL, 'plan_payment_not_applied_suspended', 'plan_upgrade_payments', pay.id,
      jsonb_build_object('doctor_id', pay.doctor_id, 'target_tier', pay.target_tier, 'amount', pay.amount));
    RETURN jsonb_build_object('ok', false, 'code', 'suspended');
  END IF;

  -- Seats bought inside a renewal order (Premium renewals only).
  v_seats := COALESCE(pay.seats_quantity, 0);
  IF v_seats > 0 AND pay.target_tier <> 'premium' THEN
    INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, details)
    VALUES (NULL, 'renewal_seats_not_applied_tier', 'plan_upgrade_payments', pay.id,
      jsonb_build_object('doctor_id', pay.doctor_id, 'target_tier', pay.target_tier, 'seats', v_seats));
    PERFORM public.flag_payment_needs_refund(pay.id, 'renewal_seats_not_applied_tier',
      'Your renewal included extra doctor seats, but seats can only be added to a Premium plan. We will refund the seats or help you buy them again.');
    v_clamped := true;
    v_seats := 0;
  END IF;

  -- Live paid plan -> schedule for the end of the current period.
  IF prof.plan_status = 'active' AND prof.plan_end IS NOT NULL AND prof.plan_end > now() THEN
    SELECT payment_id INTO v_old_payment FROM public.pending_plans WHERE doctor_id = pay.doctor_id LIMIT 1;
    IF v_old_payment IS NOT NULL AND v_old_payment IS DISTINCT FROM pay.id THEN
      INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, details)
      VALUES (NULL, 'superseded_scheduled_plan_needs_refund', 'plan_upgrade_payments', v_old_payment,
        jsonb_build_object('doctor_id', pay.doctor_id, 'replaced_by_payment', pay.id));
      -- The superseded order's not-yet-started seats go with it (its money is flagged for refund).
      DELETE FROM public.clinic_seat_periods WHERE payment_id = v_old_payment AND starts_at > now();
    END IF;
    DELETE FROM public.pending_plans WHERE doctor_id = pay.doctor_id;
    INSERT INTO public.pending_plans (doctor_id, target_tier, activation_date, payment_id)
    VALUES (pay.doctor_id, pay.target_tier, prof.plan_end, pay.id);
    IF v_seats > 0 THEN
      IF public.grant_renewal_seat_period(pay.id, pay.doctor_id, v_seats, prof.plan_end) THEN
        v_clamped := true;
      END IF;
    END IF;
    RETURN jsonb_build_object('ok', true, 'plan_tier', pay.target_tier, 'scheduled', true,
      'activation_date', prof.plan_end)
      || CASE WHEN v_clamped THEN jsonb_build_object('seats_clamped', true) ELSE '{}'::jsonb END;
  END IF;

  -- No live paid plan (trial, expired, lapsed, or manual plan with no end) -> immediate.
  UPDATE public.profiles
  SET plan_tier = pay.target_tier,
      plan_status = 'active',
      trial_end = NULL,
      plan_end = now() + interval '30 days'
  WHERE id = pay.doctor_id;
  IF v_seats > 0 THEN
    IF public.grant_renewal_seat_period(pay.id, pay.doctor_id, v_seats, now()) THEN
      v_clamped := true;
    END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'plan_tier', pay.target_tier, 'scheduled', false)
    || CASE WHEN v_clamped THEN jsonb_build_object('seats_clamped', true) ELSE '{}'::jsonb END;
END;
$function$;

-- 5. Seats follow plan_end (a superadmin Extend moves a scheduled renewal; its seats move with it).
CREATE OR REPLACE FUNCTION public.sync_pending_plan_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  pp record;
BEGIN
  IF NEW.plan_end IS NOT NULL AND NEW.plan_end IS DISTINCT FROM OLD.plan_end THEN
    FOR pp IN SELECT id, payment_id, activation_date FROM public.pending_plans WHERE doctor_id = NEW.id FOR UPDATE LOOP
      UPDATE public.pending_plans SET activation_date = NEW.plan_end WHERE id = pp.id;
      IF pp.payment_id IS NOT NULL AND pp.activation_date IS NOT NULL AND pp.activation_date <> NEW.plan_end THEN
        UPDATE public.clinic_seat_periods
           SET starts_at = starts_at + (NEW.plan_end - pp.activation_date),
               ends_at   = ends_at   + (NEW.plan_end - pp.activation_date)
         WHERE payment_id = pp.payment_id;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;

-- 6. Superadmin launch settings -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.multi_doctor_setting_valid(_key text, _value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  n numeric;
BEGIN
  IF _value IS NULL THEN
    RETURN false;
  END IF;
  IF _key = 'multi_doctor_enabled' THEN
    RETURN jsonb_typeof(_value) = 'boolean';
  ELSIF _key = 'doctor_seat_price' THEN
    IF jsonb_typeof(_value) = 'null' THEN
      RETURN true;   -- unset
    END IF;
    IF jsonb_typeof(_value) <> 'number' THEN
      RETURN false;
    END IF;
    n := (_value #>> '{}')::numeric;
    RETURN n > 0 AND n <= 100000;
  ELSIF _key IN ('doctor_seat_max', 'trial_extra_doctor_seats') THEN
    IF jsonb_typeof(_value) <> 'number' THEN
      RETURN false;
    END IF;
    n := (_value #>> '{}')::numeric;
    IF n <> trunc(n) THEN
      RETURN false;
    END IF;
    IF _key = 'doctor_seat_max' THEN
      RETURN n BETWEEN 2 AND 50;
    END IF;
    RETURN n BETWEEN 0 AND 5;
  END IF;
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.multi_doctor_setting_valid(text, jsonb) FROM PUBLIC, anon, authenticated;

-- Live body (20261028150000) + the four multi-doctor keys.
CREATE OR REPLACE FUNCTION public.validate_platform_setting()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  n numeric;
BEGIN
  IF NEW.key IN ('pro_default_price', 'premium_default_price') THEN
    IF jsonb_typeof(NEW.value) <> 'number' THEN RAISE EXCEPTION '% must be a number', NEW.key; END IF;
    n := (NEW.value #>> '{}')::numeric;
    IF n <> trunc(n) OR n < 1 OR n > 100000 THEN
      RAISE EXCEPTION '% must be a whole number of rupees between 1 and 100000', NEW.key;
    END IF;
  ELSIF NEW.key = 'default_commission_percent' THEN
    IF jsonb_typeof(NEW.value) <> 'number' THEN RAISE EXCEPTION '% must be a number', NEW.key; END IF;
    n := (NEW.value #>> '{}')::numeric;
    IF n < 0 OR n > 100 THEN RAISE EXCEPTION '% must be between 0 and 100', NEW.key; END IF;
  ELSIF NEW.key = 'default_trial_days' THEN
    IF jsonb_typeof(NEW.value) <> 'number' THEN RAISE EXCEPTION '% must be a number', NEW.key; END IF;
    n := (NEW.value #>> '{}')::numeric;
    IF n <> trunc(n) OR n < 0 OR n > 365 THEN RAISE EXCEPTION '% must be a whole number of days between 0 and 365', NEW.key; END IF;
  ELSIF NEW.key IN ('multi_doctor_enabled', 'doctor_seat_price', 'doctor_seat_max', 'trial_extra_doctor_seats') THEN
    IF NOT COALESCE(public.multi_doctor_setting_valid(NEW.key, NEW.value), false) THEN
      RAISE EXCEPTION '% has an invalid value', NEW.key;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Every write path (the RPC, the table API, SQL) to these four keys is audited.
CREATE OR REPLACE FUNCTION public.audit_multi_doctor_setting()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_key   text := CASE WHEN TG_OP = 'DELETE' THEN OLD.key ELSE NEW.key END;
  v_old   jsonb := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.value END;
  v_new   jsonb := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.value END;
  v_actor uuid;
BEGIN
  IF v_key NOT IN ('multi_doctor_enabled', 'doctor_seat_price', 'doctor_seat_max', 'trial_extra_doctor_seats') THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'UPDATE' AND v_old IS NOT DISTINCT FROM v_new THEN
    RETURN NEW;
  END IF;
  SELECT id INTO v_actor FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, details)
  VALUES (v_actor, 'platform_setting_changed', 'platform_settings', NULL,
          jsonb_build_object('key', v_key, 'old', v_old, 'new', v_new));
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE ALL ON FUNCTION public.audit_multi_doctor_setting() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_multi_doctor_setting ON public.platform_settings;
CREATE TRIGGER trg_audit_multi_doctor_setting
  AFTER INSERT OR UPDATE OR DELETE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.audit_multi_doctor_setting();

-- The superadmin card saves through this: all-or-nothing, only these four keys, real jsonb values
-- (a cleared price is the jsonb null; platform_settings.value is NOT NULL).
CREATE OR REPLACE FUNCTION public.set_multi_doctor_settings(_changes jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  k         text;
  v         jsonb;
  v_cur     jsonb;
  v_changed text[] := ARRAY[]::text[];
BEGIN
  IF v_uid IS NULL
     OR NOT COALESCE(public.has_role(v_uid, 'admin') OR public.sa_has_permission(v_uid, 'flags.manage'), false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;
  IF _changes IS NULL OR jsonb_typeof(_changes) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_VALUE');
  END IF;
  FOR k, v IN SELECT key, value FROM jsonb_each(_changes) LOOP
    IF k NOT IN ('multi_doctor_enabled', 'doctor_seat_price', 'doctor_seat_max', 'trial_extra_doctor_seats')
       OR NOT COALESCE(public.multi_doctor_setting_valid(k, v), false) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'INVALID_VALUE', 'key', k);
    END IF;
  END LOOP;
  FOR k, v IN SELECT key, value FROM jsonb_each(_changes) LOOP
    SELECT value INTO v_cur FROM public.platform_settings WHERE key = k;
    IF NOT FOUND OR v_cur IS DISTINCT FROM v THEN
      INSERT INTO public.platform_settings (key, value, updated_at) VALUES (k, v, now())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
      v_changed := v_changed || k;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true,
    'changed', (SELECT COALESCE(jsonb_agg(x ORDER BY x), '[]'::jsonb) FROM unnest(v_changed) AS x));
END;
$$;
REVOKE ALL ON FUNCTION public.set_multi_doctor_settings(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_multi_doctor_settings(jsonb) TO authenticated;

-- 7. Reviews: live guard (20261127100200) + length limits and an hourly throttle for visitors. ---------
CREATE OR REPLACE FUNCTION public.guard_review_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_trusted boolean;
BEGIN
  IF NEW.practitioner_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.practitioner_id IS DISTINCT FROM OLD.practitioner_id) THEN
    IF NOT EXISTS (SELECT 1 FROM public.practitioners
                    WHERE id = NEW.practitioner_id AND doctor_id = NEW.doctor_id AND is_active) THEN
      RAISE EXCEPTION 'PRACTITIONER_MISMATCH' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' THEN
    -- The clinic owner, its staff and the service role (no JWT role: cron, migrations) may set
    -- these; everyone else (anon, any other signed-in user) always starts unverified and unpinned.
    v_trusted := COALESCE(auth.role() IS NULL OR auth.role() = 'service_role'
                          OR auth.uid() = NEW.doctor_id
                          OR public.staff_doctor_id(auth.uid()) = NEW.doctor_id, false);
    IF NOT v_trusted THEN
      NEW.is_verified := false;
      NEW.is_pinned := false;
      IF length(COALESCE(NEW.patient_name, '')) > 100 OR length(COALESCE(NEW.review_text, '')) > 2000 THEN
        RAISE EXCEPTION 'REVIEW_TOO_LONG' USING ERRCODE = 'check_violation';
      END IF;
      -- At most 20 visitor reviews per clinic per hour.
      IF (SELECT count(*) FROM public.reviews
           WHERE doctor_id = NEW.doctor_id AND created_at > now() - interval '1 hour') >= 20 THEN
        RAISE EXCEPTION 'REVIEW_RATE_LIMIT' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 8. Revenue: an invoice counts in the period it was ISSUED (even if refunded later); refunds stay
--    in the period they were refunded; net_after_refunds = net - refunds. The date predicate is in
--    the inv CTE so the index on (doctor_id, created_at) is used.
CREATE OR REPLACE FUNCTION public.practitioner_revenue_core(_clinic uuid, _from date, _to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_from timestamptz := (_from::timestamp) AT TIME ZONE 'Asia/Kolkata';
  v_to   timestamptz := ((_to + 1)::timestamp) AT TIME ZONE 'Asia/Kolkata';
  v_rows jsonb;
  v_un   jsonb;
  v_tot  jsonb;
BEGIN
  WITH inv AS (
    SELECT practitioner_id AS pid,
           (created_at >= v_from AND created_at < v_to) AS is_paid,
           (status = 'refunded' AND COALESCE(refunded_at, created_at) >= v_from
                                AND COALESCE(refunded_at, created_at) < v_to) AS is_refund,
           lower(COALESCE(payment_method, '')) AS m,
           amount, gst_amount, commission_amount,
           COALESCE(net_amount, amount - commission_amount) AS net
      FROM public.invoices
     WHERE doctor_id = _clinic
       AND ((created_at >= v_from AND created_at < v_to)
            OR (status = 'refunded' AND COALESCE(refunded_at, created_at) >= v_from
                                    AND COALESCE(refunded_at, created_at) < v_to))
  ),
  ia AS (
    SELECT pid,
           count(*) FILTER (WHERE is_paid) AS n_paid,
           COALESCE(sum(amount) FILTER (WHERE is_paid), 0) AS paid_amount,
           COALESCE(sum(gst_amount) FILTER (WHERE is_paid), 0) AS gst_amount,
           COALESCE(sum(amount) FILTER (WHERE is_paid AND m = 'cash'), 0) AS cash,
           COALESCE(sum(amount) FILTER (WHERE is_paid AND m = 'upi'), 0) AS upi,
           COALESCE(sum(amount) FILTER (WHERE is_paid AND m = 'card'), 0) AS card,
           COALESCE(sum(amount) FILTER (WHERE is_paid AND m = 'online'), 0) AS online,
           COALESCE(sum(amount) FILTER (WHERE is_paid AND m NOT IN ('cash', 'upi', 'card', 'online', '')), 0) AS other,
           COALESCE(sum(amount) FILTER (WHERE is_paid AND m = ''), 0) AS unrecorded,
           count(*) FILTER (WHERE is_refund) AS refunds_count,
           COALESCE(sum(amount) FILTER (WHERE is_refund), 0) AS refunds_amount,
           COALESCE(sum(commission_amount) FILTER (WHERE is_paid), 0) AS platform_charge,
           COALESCE(sum(net) FILTER (WHERE is_paid), 0) AS net
      FROM inv GROUP BY pid
  ),
  aa AS (
    SELECT practitioner_id AS pid,
           count(*) FILTER (WHERE status::text = 'completed') AS visits_completed,
           count(*) FILTER (WHERE status::text = 'no_show') AS no_shows,
           count(*) FILTER (WHERE status::text = 'no_show' AND payment_status::text = 'paid') AS paid_no_shows_count,
           COALESCE(sum(amount) FILTER (WHERE status::text = 'no_show' AND payment_status::text = 'paid'), 0) AS paid_no_shows_amount
      FROM public.appointments
     WHERE doctor_id = _clinic AND date >= _from AND date <= _to
     GROUP BY practitioner_id
  ),
  keys AS (
    SELECT id AS pid FROM public.practitioners WHERE doctor_id = _clinic
    UNION ALL
    SELECT NULL::uuid
  ),
  m AS (
    SELECT k.pid,
           COALESCE(aa.visits_completed, 0) AS visits_completed,
           COALESCE(ia.paid_amount, 0) AS paid_amount,
           COALESCE(ia.gst_amount, 0) AS gst_amount,
           COALESCE(ia.cash, 0) AS cash, COALESCE(ia.upi, 0) AS upi, COALESCE(ia.card, 0) AS card,
           COALESCE(ia.online, 0) AS online, COALESCE(ia.other, 0) AS other, COALESCE(ia.unrecorded, 0) AS unrecorded,
           COALESCE(ia.refunds_count, 0) AS refunds_count,
           COALESCE(ia.refunds_amount, 0) AS refunds_amount,
           COALESCE(aa.no_shows, 0) AS no_shows,
           COALESCE(aa.paid_no_shows_count, 0) AS paid_no_shows_count,
           COALESCE(aa.paid_no_shows_amount, 0) AS paid_no_shows_amount,
           COALESCE(ia.platform_charge, 0) AS platform_charge,
           COALESCE(ia.net, 0) AS net,
           COALESCE(ia.net, 0) - COALESCE(ia.refunds_amount, 0) AS net_after_refunds,
           COALESCE(ia.n_paid, 0) AS n_paid
      FROM keys k
      LEFT JOIN ia ON ia.pid IS NOT DISTINCT FROM k.pid
      LEFT JOIN aa ON aa.pid IS NOT DISTINCT FROM k.pid
  ),
  r AS (
    SELECT p.is_primary, p.sort_order, p.created_at,
           public.revenue_nest_modes(
             (to_jsonb(m) - 'pid' - 'n_paid')
             || jsonb_build_object('practitioner_id', p.id, 'display_name', p.display_name, 'is_active', p.is_active)) AS j
      FROM public.practitioners p
      JOIN m ON m.pid = p.id
     WHERE p.doctor_id = _clinic
       AND (p.is_active OR (m.visits_completed + m.no_shows + m.n_paid + m.refunds_count) > 0)
  ),
  u AS (
    SELECT public.revenue_nest_modes(to_jsonb(m) - 'pid' - 'n_paid') AS j FROM m WHERE pid IS NULL
  ),
  t AS (
    SELECT public.revenue_nest_modes(to_jsonb(s)) AS j
      FROM (SELECT sum(visits_completed)::bigint AS visits_completed, sum(paid_amount) AS paid_amount,
                   sum(gst_amount) AS gst_amount, sum(cash) AS cash, sum(upi) AS upi, sum(card) AS card,
                   sum(online) AS online, sum(other) AS other, sum(unrecorded) AS unrecorded,
                   sum(refunds_count)::bigint AS refunds_count, sum(refunds_amount) AS refunds_amount,
                   sum(no_shows)::bigint AS no_shows, sum(paid_no_shows_count)::bigint AS paid_no_shows_count,
                   sum(paid_no_shows_amount) AS paid_no_shows_amount,
                   sum(platform_charge) AS platform_charge, sum(net) AS net,
                   sum(net_after_refunds) AS net_after_refunds
              FROM m) s
  )
  SELECT (SELECT COALESCE(jsonb_agg(j ORDER BY is_primary DESC, sort_order, created_at), '[]'::jsonb) FROM r),
         (SELECT j FROM u),
         (SELECT j FROM t)
    INTO v_rows, v_un, v_tot;

  RETURN jsonb_build_object('rows', v_rows, 'unattributed', v_un, 'totals', v_tot);
END;
$$;
REVOKE ALL ON FUNCTION public.practitioner_revenue_core(uuid, date, date) FROM PUBLIC, anon, authenticated;

-- 9. Directory: a plain view the planner can push city/specialty into (a SECURITY DEFINER function
--    cannot be inlined, so every clinic was materialised before any filter ran). The two readers are
--    plpgsql so the city/specialty parameters are constants in the (custom) plan and the partial
--    indexes on profiles can be used; a SQL function is planned generically, where "p_city IS NULL OR
--    ..." defeats the index. Same rows as the
--    old directory_entries(). Nobody but the owner reads it; search_doctors/directory_facets
--    (SECURITY DEFINER) are the only readers.
CREATE OR REPLACE VIEW public.directory_entries_v WITH (security_invoker = true) AS
  SELECT c.id, c.slug, c.full_name, c.specialization, c.qualifications, c.experience_years::int AS experience_years,
         c.clinic_name, c.city, c.state, c.locality, c.pincode, c.consultation_fee::numeric AS consultation_fee,
         c.profile_photo_url,
         rv.avg_rating::numeric AS avg_rating, coalesce(rv.review_count, 0) AS review_count,
         NULL::text AS practitioner_slug
    FROM public.profiles c
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE x.is_active) AS n_active,
             bool_or(x.is_active AND x.directory_listed) AS any_listed
        FROM public.practitioners x
       WHERE x.doctor_id = c.id
    ) pc ON true
    LEFT JOIN LATERAL (
      SELECT avg(r.rating) AS avg_rating, count(*) AS review_count
        FROM public.reviews r
       WHERE r.doctor_id = c.id AND r.is_visible = true
    ) rv ON true
   WHERE c.slug IS NOT NULL AND c.onboarding_completed = true
     AND c.directory_listed = true AND c.plan_status <> 'cancelled'
     AND NOT (pc.n_active >= 2 AND COALESCE(pc.any_listed, false))
  UNION ALL
  SELECT l.id, c.slug, l.display_name,
         COALESCE(l.specialization, c.specialization), COALESCE(l.qualifications, c.qualifications),
         COALESCE(l.experience_years, c.experience_years)::int,
         c.clinic_name, c.city, c.state, c.locality, c.pincode,
         COALESCE(l.consultation_fee, c.consultation_fee)::numeric,
         COALESCE(l.photo_url, c.profile_photo_url),
         rv.avg_rating::numeric, coalesce(rv.review_count, 0), l.slug
    FROM public.practitioners l
    JOIN public.profiles c ON c.id = l.doctor_id
    LEFT JOIN LATERAL (
      SELECT avg(r.rating) AS avg_rating, count(*) AS review_count
        FROM public.reviews r
       WHERE r.practitioner_id = l.id AND r.is_visible = true
    ) rv ON true
   WHERE c.slug IS NOT NULL AND c.onboarding_completed = true
     AND c.directory_listed = true AND c.plan_status <> 'cancelled'
     AND l.is_active AND l.directory_listed
     AND EXISTS (SELECT 1 FROM public.practitioners o
                  WHERE o.doctor_id = c.id AND o.is_active AND o.id <> l.id);   -- 2+ active doctors
REVOKE ALL ON public.directory_entries_v FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.search_doctors(p_query text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_specialty text DEFAULT NULL::text, p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, slug text, full_name text, specialization text, qualifications text, experience_years integer, clinic_name text, city text, state text, locality text, consultation_fee numeric, profile_photo_url text, avg_rating numeric, review_count bigint, total_count bigint, practitioner_slug text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH params AS (
    SELECT
      nullif(btrim(lower(left(p_query, 100))), '') AS q,
      '%' || replace(replace(replace(nullif(btrim(lower(left(p_query, 100))), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%' AS q_like
  )
  SELECT
    e.id, e.slug, e.full_name, e.specialization, e.qualifications,
    e.experience_years, e.clinic_name, e.city, e.state, e.locality,
    e.consultation_fee, e.profile_photo_url,
    round(e.avg_rating::numeric, 1), e.review_count,
    count(*) OVER (),
    e.practitioner_slug
  FROM public.directory_entries_v e
  CROSS JOIN params
  WHERE (p_city IS NULL OR public.directory_slugify(e.city) = p_city)
    AND (p_specialty IS NULL OR public.directory_slugify(e.specialization) = p_specialty)
    AND (
      params.q IS NULL
      OR lower(e.full_name) LIKE params.q_like
      OR lower(e.full_name) % params.q
      OR lower(coalesce(e.specialization, '')) LIKE params.q_like
      OR lower(coalesce(e.clinic_name, '')) LIKE params.q_like
      OR lower(coalesce(e.city, '')) LIKE params.q_like
      OR lower(coalesce(e.locality, '')) LIKE params.q_like
      OR e.pincode = params.q
    )
  ORDER BY
    CASE WHEN params.q IS NULL THEN 0
         ELSE similarity(lower(e.full_name), params.q) END DESC,
    e.avg_rating DESC NULLS LAST,
    e.review_count DESC NULLS LAST,
    (e.profile_photo_url IS NOT NULL) DESC,
    e.full_name ASC,
    e.id ASC
  LIMIT least(greatest(coalesce(p_limit, 24), 1), 100)
  OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.directory_facets(p_city text DEFAULT NULL::text)
 RETURNS TABLE(kind text, slug text, label text, doctor_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH listed AS (
    SELECT btrim(e.city) AS city, btrim(e.specialization) AS specialization
    FROM public.directory_entries_v e
    WHERE (p_city IS NULL OR public.directory_slugify(e.city) = p_city)
  ),
  c AS (
    SELECT public.directory_slugify(city) AS s, city AS l, count(*) AS n
    FROM listed WHERE p_city IS NULL AND public.directory_slugify(city) <> ''
    GROUP BY 1, 2
  ),
  sp AS (
    SELECT public.directory_slugify(specialization) AS s, specialization AS l, count(*) AS n
    FROM listed WHERE public.directory_slugify(specialization) <> ''
    GROUP BY 1, 2
  )
  SELECT 'city'::text, s, (array_agg(l ORDER BY n DESC, (l = lower(l) OR l = upper(l)), l))[1], sum(n)::bigint
  FROM c GROUP BY s
  UNION ALL
  SELECT 'specialty'::text, s, (array_agg(l ORDER BY n DESC, (l = lower(l) OR l = upper(l)), l))[1], sum(n)::bigint
  FROM sp GROUP BY s
  ORDER BY 1, 4 DESC, 3;
END;
$function$;

-- Nothing reads the old materialising function any more (search_doctors/directory_facets above were
-- the only callers; SQL function bodies carry no dependency, so this is checked, not assumed).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p
              WHERE p.pronamespace = 'public'::regnamespace
                AND p.proname <> 'directory_entries'
                AND p.prokind = 'f'
                AND p.prosrc ~ 'directory_entries\s*\(') THEN
    RAISE EXCEPTION 'directory_entries() is still referenced by a function; refusing to drop it';
  END IF;
END $$;
DROP FUNCTION IF EXISTS public.directory_entries();

-- 10. Services mapped only to deactivated doctors behave as unmapped ---------------------------------
CREATE OR REPLACE FUNCTION public.get_public_service_practitioners(_doctor_id uuid)
RETURNS TABLE(service_id uuid, practitioner_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT sp.service_id, sp.practitioner_id
    FROM public.service_practitioners sp
    JOIN public.services s ON s.id = sp.service_id AND s.active
    JOIN public.practitioners pm ON pm.id = sp.practitioner_id AND pm.is_active
    JOIN public.profiles pr ON pr.id = sp.doctor_id
   WHERE sp.doctor_id = _doctor_id
     AND pr.onboarding_completed = true
     AND pr.plan_status <> 'cancelled'
$function$;

CREATE OR REPLACE FUNCTION public.public_booking_price(_doctor_id uuid, _service_name text, _type text, _practitioner_id uuid DEFAULT NULL::uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fee numeric;
  v_online numeric;
  v_default numeric;
  v_price numeric;
  v_pid uuid;
BEGIN
  SELECT NULLIF(consultation_fee, 0) INTO v_fee FROM public.practitioners
   WHERE id = _practitioner_id AND doctor_id = _doctor_id;
  IF v_fee IS NULL THEN
    SELECT COALESCE(NULLIF(consultation_fee, 0), 500) INTO v_fee FROM public.profiles WHERE id = _doctor_id;
  END IF;
  v_fee := COALESCE(v_fee, 500);
  SELECT NULLIF(online_fee, 0) INTO v_online FROM public.website_settings WHERE doctor_id = _doctor_id;
  v_default := CASE WHEN _type = 'online' THEN COALESCE(v_online, v_fee) ELSE v_fee END;

  -- A NULL doctor means the primary (same rule as the booking RPCs).
  v_pid := COALESCE(_practitioner_id, public.primary_practitioner_id(_doctor_id));

  -- Only ACTIVE doctors count as a service's mapping: mapped only to deactivated doctors = unmapped.
  SELECT s.price INTO v_price FROM public.services s
   WHERE s.doctor_id = _doctor_id AND s.active = true
     AND lower(btrim(s.name)) = lower(btrim(COALESCE(_service_name, '')))
     AND (s.type = _type OR s.type = 'both')
     AND (NOT EXISTS (SELECT 1 FROM public.service_practitioners sp
                        JOIN public.practitioners pm ON pm.id = sp.practitioner_id AND pm.is_active
                       WHERE sp.service_id = s.id)
          OR EXISTS (SELECT 1 FROM public.service_practitioners sp
                       JOIN public.practitioners pm ON pm.id = sp.practitioner_id AND pm.is_active
                      WHERE sp.service_id = s.id AND sp.practitioner_id = v_pid))
   ORDER BY (s.price > 0) DESC,
            EXISTS (SELECT 1 FROM public.service_practitioners sp
                      JOIN public.practitioners pm ON pm.id = sp.practitioner_id AND pm.is_active
                     WHERE sp.service_id = s.id AND sp.practitioner_id = v_pid) DESC,
            s.sort_order
   LIMIT 1;

  IF v_price IS NOT NULL AND v_price > 0 THEN
    RETURN v_price;
  END IF;
  RETURN v_default;
END;
$function$;

-- Live body (20261125100200) + SERVICE_NOT_OFFERED for the anonymous path.
CREATE OR REPLACE FUNCTION public.enforce_public_booking_limits()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_internal boolean := (auth.role() IS NULL OR auth.role() = 'service_role');
  v_clinic   boolean := COALESCE(auth.uid() IS NOT NULL
                         AND (auth.uid() = NEW.doctor_id OR public.staff_doctor_id(auth.uid()) = NEW.doctor_id), false);
  today      date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  open_count integer;
  v_pid      uuid;
BEGIN
  -- Staff bookings, cron and the payment edge function (service key) are trusted.
  IF v_internal OR v_clinic THEN
    RETURN NEW;
  END IF;

  IF length(regexp_replace(COALESCE(NEW.patient_phone, ''), '\D', '', 'g')) < 10 THEN
    RAISE EXCEPTION 'PHONE_REQUIRED' USING ERRCODE = 'check_violation';
  END IF;

  -- A visitor cannot pick a doctor who does not offer the service. The service must exist for this
  -- clinic, and every copy of it must be mapped (to active doctors) without including this doctor.
  IF btrim(COALESCE(NEW.service_name, '')) <> '' THEN
    v_pid := COALESCE(NEW.practitioner_id, public.primary_practitioner_id(NEW.doctor_id));
    IF EXISTS (SELECT 1 FROM public.services s
                WHERE s.doctor_id = NEW.doctor_id AND s.active
                  AND lower(btrim(s.name)) = lower(btrim(NEW.service_name))
                  AND (s.type = NEW.appointment_type::text OR s.type = 'both'))
       AND NOT EXISTS (
         SELECT 1 FROM public.services s
          WHERE s.doctor_id = NEW.doctor_id AND s.active
            AND lower(btrim(s.name)) = lower(btrim(NEW.service_name))
            AND (s.type = NEW.appointment_type::text OR s.type = 'both')
            AND (NOT EXISTS (SELECT 1 FROM public.service_practitioners sp
                               JOIN public.practitioners pm ON pm.id = sp.practitioner_id AND pm.is_active
                              WHERE sp.service_id = s.id)
                 OR EXISTS (SELECT 1 FROM public.service_practitioners sp
                              JOIN public.practitioners pm ON pm.id = sp.practitioner_id AND pm.is_active
                             WHERE sp.service_id = s.id AND sp.practitioner_id = v_pid))) THEN
      RAISE EXCEPTION 'SERVICE_NOT_OFFERED' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- One person cannot hold the whole day: at most 3 open future bookings per clinic.
  PERFORM pg_advisory_xact_lock(hashtext('pubbook:' || NEW.doctor_id::text || NEW.patient_phone));
  SELECT count(*) INTO open_count FROM public.appointments
   WHERE doctor_id = NEW.doctor_id AND patient_phone = NEW.patient_phone
     AND status IN ('pending', 'confirmed') AND date >= today;
  IF open_count >= 3 THEN
    RAISE EXCEPTION 'TOO_MANY_BOOKINGS' USING ERRCODE = 'check_violation';
  END IF;

  -- The price comes from the clinic's own setup, never from the visitor.
  NEW.amount := public.public_booking_price(NEW.doctor_id, NEW.service_name, NEW.appointment_type::text, NEW.practitioner_id);
  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';
