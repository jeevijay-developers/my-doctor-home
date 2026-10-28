-- Plan / subscription flow hardening (findings from the plan-module audit).
-- Everything here is idempotent (CREATE OR REPLACE / IF NOT EXISTS) except the
-- intentional DROP of resume_subscription().

-- ============================================
-- 1. pending_plans had Row Level Security DISABLED in production while anon and
-- authenticated held full table privileges, so anyone could insert a scheduled
-- upgrade for any doctor (activated for free by the 04:00 UTC cron) or read /
-- delete other doctors' rows. Writes happen only from service_role edge
-- functions and SECURITY DEFINER functions, so no write policy is needed.
-- ============================================
ALTER TABLE public.pending_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctors view own pending plans" ON public.pending_plans;
CREATE POLICY "Doctors view own pending plans" ON public.pending_plans
  FOR SELECT USING (auth.uid() = doctor_id);

-- Cancelling goes through the cancel-scheduled-plan edge function (it also
-- handles the refund + audit), so doctors no longer delete rows directly.
DROP POLICY IF EXISTS "Doctors delete own pending plans" ON public.pending_plans;

DROP POLICY IF EXISTS "Admins view all pending plans" ON public.pending_plans;
CREATE POLICY "Admins view all pending plans" ON public.pending_plans
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Team views pending plans" ON public.pending_plans;
CREATE POLICY "Team views pending plans" ON public.pending_plans
  FOR SELECT USING (public.sa_has_any_permission(auth.uid(), ARRAY['subscriptions.view', 'doctors.view']));

REVOKE ALL ON public.pending_plans FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.pending_plans FROM authenticated;

-- ============================================
-- 2. Profile guards: also protect plan_end (staff guard missed it) and the
-- billing / payout columns, which a doctor could otherwise rewrite from the
-- browser (e.g. commission_percent = 0 or pointing razorpay_account_id at their
-- own account). Superadmins/team and service_role are unaffected (the doctor
-- guard only applies when auth.uid() is the row owner).
-- ============================================
CREATE OR REPLACE FUNCTION public.guard_doctor_plan_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND auth.uid() = OLD.id
     AND NOT public.has_role(auth.uid(), 'admin')
     AND current_setting('app.plan_write_ok', true) IS DISTINCT FROM 'on' THEN
    IF NEW.plan_tier IS DISTINCT FROM OLD.plan_tier
       OR NEW.plan_status IS DISTINCT FROM OLD.plan_status
       OR NEW.plan_end IS DISTINCT FROM OLD.plan_end
       OR NEW.trial_start IS DISTINCT FROM OLD.trial_start
       OR NEW.trial_end IS DISTINCT FROM OLD.trial_end
       OR NEW.custom_plan_price IS DISTINCT FROM OLD.custom_plan_price
       OR NEW.commission_percent IS DISTINCT FROM OLD.commission_percent
       OR NEW.razorpay_account_id IS DISTINCT FROM OLD.razorpay_account_id
       OR NEW.razorpay_account_status IS DISTINCT FROM OLD.razorpay_account_status
       OR NEW.razorpay_payment_enabled IS DISTINCT FROM OLD.razorpay_payment_enabled THEN
      RAISE EXCEPTION 'Plan and billing settings can only be changed through checkout or by support';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_staff_profile_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.staff_doctor_id(auth.uid()) IS NOT NULL THEN
    IF NEW.plan_status IS DISTINCT FROM OLD.plan_status
       OR NEW.plan_tier IS DISTINCT FROM OLD.plan_tier
       OR NEW.plan_end IS DISTINCT FROM OLD.plan_end
       OR NEW.trial_start IS DISTINCT FROM OLD.trial_start
       OR NEW.trial_end IS DISTINCT FROM OLD.trial_end
       OR NEW.custom_plan_price IS DISTINCT FROM OLD.custom_plan_price
       OR NEW.commission_percent IS DISTINCT FROM OLD.commission_percent
       OR NEW.razorpay_account_id IS DISTINCT FROM OLD.razorpay_account_id
       OR NEW.razorpay_account_status IS DISTINCT FROM OLD.razorpay_account_status
       OR NEW.razorpay_payment_enabled IS DISTINCT FROM OLD.razorpay_payment_enabled THEN
      RAISE EXCEPTION 'Staff are not permitted to change billing/plan settings';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================
-- 3. resume_subscription let a SUSPENDED doctor un-suspend themselves:
-- superadmin "Suspend" writes plan_status='cancelled' and keeps plan_end, and
-- there is no doctor-initiated cancel, so 'cancelled' always means suspended.
-- Resuming is a support action; the Settings button is removed in the app.
-- ============================================
DROP FUNCTION IF EXISTS public.resume_subscription();

-- ============================================
-- 4. Entitlements must respect status and expiry, not just plan_tier.
--   * a lapsed/expired/suspended 'premium' doctor no longer keeps premium access
--   * a trial whose trial_end passed loses access immediately, not at 02:00 UTC
--   * plan_end gets a 1-day grace to cover the daily activation/expiry crons
--     (plan_end NULL = manually granted, no expiry)
-- ============================================
CREATE OR REPLACE FUNCTION public.doctor_has_premium_access(_doctor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _doctor_id
      AND (
        (plan_status = 'trial' AND (trial_end IS NULL OR trial_end > now()))
        OR (plan_tier = 'premium' AND plan_status = 'active'
            AND (plan_end IS NULL OR plan_end > now() - interval '1 day'))
      )
  )
$$;

-- A custom plan only applies while the doctor is on the live paid plan it was
-- approved against (same tier, active, not lapsed).
CREATE OR REPLACE FUNCTION public.doctor_active_custom_plan(_doctor_id uuid)
RETURNS public.doctor_custom_plans
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cp.* FROM public.doctor_custom_plans cp
  JOIN public.profiles p ON p.id = cp.doctor_id
  WHERE cp.doctor_id = _doctor_id
    AND cp.status = 'active'
    AND cp.valid_from <= now()
    AND (cp.valid_until IS NULL OR cp.valid_until > now())
    AND p.plan_status = 'active'
    AND (p.plan_end IS NULL OR p.plan_end > now() - interval '1 day')
    AND cp.base_tier = p.plan_tier
$$;

-- DB-level enforcement must follow the same precedence as the UI
-- (override > custom plan > tier), not tier alone.
CREATE OR REPLACE FUNCTION public.enforce_online_consultation_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.show_online_consultation = true
     AND (OLD.show_online_consultation IS DISTINCT FROM true)
     AND NOT public.doctor_has_feature(NEW.doctor_id, 'online_consultation') THEN
    RAISE EXCEPTION 'ONLINE_CONSULTATION_REQUIRES_PREMIUM: Online Consultation is not included in your plan'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

-- Internal helpers: were executable by anyone through PostgREST
-- (e.g. anon could read any doctor's negotiated price).
REVOKE EXECUTE ON FUNCTION public.doctor_active_custom_plan(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.doctor_tier_default(uuid, text) FROM PUBLIC, anon, authenticated;

-- ============================================
-- 5. Targeted patches to review_plan_request / get_doctor_feature_access
-- (patched in place so unrelated logic is not retyped; fails loudly if the
-- expected text is not found).
-- ============================================
DO $$
DECLARE
  d text;
  d2 text;
BEGIN
  d := pg_get_functiondef('public.review_plan_request(uuid,text,text[],numeric,timestamptz,timestamptz,text)'::regprocedure);
  d2 := replace(d, 'IF p.plan_status = ''trial'' THEN',
    'IF p.plan_status <> ''active'' OR (p.plan_end IS NOT NULL AND p.plan_end <= now()) THEN');
  d2 := replace(d2, 'Doctor is still on a trial', 'Doctor is not on an active paid plan');
  IF d2 = d THEN RAISE EXCEPTION 'review_plan_request patch did not apply'; END IF;
  EXECUTE d2;

  d := pg_get_functiondef('public.get_doctor_feature_access(uuid)'::regprocedure);
  d2 := replace(d, 'ARRAY[''doctors.view'', ''plan_requests.view'', ''subscriptions.view'']',
    'ARRAY[''doctors.view'', ''flags.view'', ''plan_requests.view'', ''subscriptions.view'']');
  IF d2 = d THEN RAISE EXCEPTION 'get_doctor_feature_access patch did not apply'; END IF;
  EXECUTE d2;
END $$;

-- ============================================
-- 6. Custom plan expiry: claim rows atomically so a concurrent
-- update_custom_plan_terms extension cannot be overwritten, and do not let
-- update_custom_plan_terms revive an already-lapsed plan.
-- ============================================
CREATE OR REPLACE FUNCTION public.expire_custom_plans()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    UPDATE public.doctor_custom_plans SET status = 'expired'
    WHERE status = 'active' AND valid_until IS NOT NULL AND valid_until <= now()
    RETURNING doctor_id
  LOOP
    INSERT INTO public.plan_request_events (doctor_id, event) VALUES (rec.doctor_id, 'expired');
    INSERT INTO public.notifications (doctor_id, source_type, title, message)
    VALUES (rec.doctor_id, 'plan_request', 'Custom plan ended',
      'Your custom plan period has ended. You are back on the standard plan for your tier.');
  END LOOP;

  -- 7 / 3 / 1 day warnings, idempotent per (doctor, title, plan end).
  INSERT INTO public.notifications (doctor_id, source_type, title, message)
  SELECT c.doctor_id, 'plan_request',
    'Custom plan ending in ' || d.days || ' day' || CASE WHEN d.days > 1 THEN 's' ELSE '' END,
    'Your custom plan ends on ' || to_char(c.valid_until AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY')
      || '. After that you return to the standard plan. Request a new custom plan to keep your features.'
  FROM public.doctor_custom_plans c
  JOIN (VALUES (7), (3), (1)) AS d(days)
    ON c.valid_until BETWEEN now() + make_interval(days => d.days - 1) AND now() + make_interval(days => d.days)
  WHERE c.status = 'active' AND c.valid_until IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.doctor_id = c.doctor_id AND n.source_type = 'plan_request'
        AND n.title = 'Custom plan ending in ' || d.days || ' day' || CASE WHEN d.days > 1 THEN 's' ELSE '' END
        AND n.created_at > c.valid_until - make_interval(days => 8)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_custom_plan_terms(_doctor_id uuid, _price numeric, _valid_until timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.sa_has_permission(auth.uid(), 'plan_requests.manage') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF _price IS NULL OR _price < 0 THEN RAISE EXCEPTION 'Price must be zero or more'; END IF;
  IF _valid_until IS NOT NULL AND _valid_until <= now() THEN
    RAISE EXCEPTION 'End date must be in the future';
  END IF;
  UPDATE public.doctor_custom_plans SET monthly_price = _price, valid_until = _valid_until
  WHERE doctor_id = _doctor_id AND status = 'active'
    AND (valid_until IS NULL OR valid_until > now());
  IF NOT FOUND THEN RAISE EXCEPTION 'No active custom plan'; END IF;
  INSERT INTO public.plan_request_events (doctor_id, actor_id, event, details)
  VALUES (_doctor_id, auth.uid(), 'terms_updated', jsonb_build_object('price', _price, 'valid_until', _valid_until));
  INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, details)
  VALUES (auth.uid(), 'update_custom_plan_terms', 'doctor_custom_plans', _doctor_id,
    jsonb_build_object('price', _price, 'valid_until', _valid_until));
END;
$$;

ALTER TABLE public.doctor_custom_plans
  DROP CONSTRAINT IF EXISTS doctor_custom_plans_price_range;
ALTER TABLE public.doctor_custom_plans
  ADD CONSTRAINT doctor_custom_plans_price_range CHECK (monthly_price >= 0 AND monthly_price <= 1000000);
CREATE INDEX IF NOT EXISTS idx_doctor_custom_plans_request ON public.doctor_custom_plans(request_id);

-- ============================================
-- 7. Scheduled-plan activation: claim rows atomically (a concurrent run could
-- double-extend plan_end and double-notify), keep the paid period continuous
-- (new period starts at the scheduled date, not "whenever cron ran"), and never
-- un-suspend a doctor.
-- ============================================
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
        plan_status = CASE WHEN plan_status = 'cancelled' THEN 'cancelled' ELSE 'active' END,
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

-- Paid plans never expired: nothing moved 'active' -> 'expired' after plan_end,
-- so a lapsed doctor kept their tier (and revenue counting) forever. Runs after
-- the 04:00 UTC activation job and skips doctors with a scheduled plan waiting.
CREATE OR REPLACE FUNCTION public.expire_paid_plans()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
BEGIN
  PERFORM set_config('app.plan_write_ok', 'on', true);
  FOR rec IN
    UPDATE public.profiles pr
    SET plan_status = 'expired'
    WHERE pr.plan_status = 'active'
      AND pr.plan_end IS NOT NULL
      AND pr.plan_end <= now()
      AND NOT EXISTS (SELECT 1 FROM public.pending_plans pp WHERE pp.doctor_id = pr.id)
    RETURNING pr.id, pr.plan_tier
  LOOP
    INSERT INTO public.notifications (doctor_id, source_type, title, message)
    VALUES (rec.id, 'direct_message', 'Your plan has expired',
      'Your ' || INITCAP(rec.plan_tier) || ' plan has ended. Renew from Settings to keep your plan features.');
    INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, details)
    VALUES (NULL, 'paid_plan_expired', 'profiles', rec.id, jsonb_build_object('tier', rec.plan_tier));
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN PERFORM cron.unschedule('expire-paid-plans'); EXCEPTION WHEN OTHERS THEN NULL; END;
    PERFORM cron.schedule('expire-paid-plans', '30 4 * * *', 'SELECT public.expire_paid_plans();');
  ELSE
    RAISE WARNING 'pg_cron is not installed: expire_paid_plans() must be scheduled manually';
  END IF;
END $$;

-- Cron/maintenance functions must not be callable through the public API.
REVOKE EXECUTE ON FUNCTION public.expire_custom_plans() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.activate_scheduled_plans() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.send_plan_expiry_notifications() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_paid_plans() FROM PUBLIC, anon, authenticated;

-- A superadmin changing plan_end (Extend) must move the scheduled plan with it,
-- otherwise the scheduled plan activates at the OLD date and shortens the
-- extension.
CREATE OR REPLACE FUNCTION public.sync_pending_plan_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.plan_end IS NOT NULL AND NEW.plan_end IS DISTINCT FROM OLD.plan_end THEN
    UPDATE public.pending_plans SET activation_date = NEW.plan_end WHERE doctor_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_pending_plan_activation ON public.profiles;
CREATE TRIGGER trg_sync_pending_plan_activation
  AFTER UPDATE OF plan_end ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_pending_plan_activation();

-- ============================================
-- 8. Atomic "apply plan payment". verify-plan-upgrade-payment and the Razorpay
-- webhook both call this, so a payment is applied exactly once whichever
-- arrives first (or both at once): the payment row is locked, only
-- 'created'/'failed' rows can be captured (a 'refunded' row can never be
-- replayed), and the status flip + plan change commit together.
-- ============================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_upgrade_payments_rzp_payment
  ON public.plan_upgrade_payments(razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_plan_upgrade_payments_order
  ON public.plan_upgrade_payments(razorpay_order_id);

CREATE OR REPLACE FUNCTION public.apply_plan_upgrade_payment(
  _payment_id uuid,
  _razorpay_payment_id text,
  _signature text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pay public.plan_upgrade_payments%ROWTYPE;
  prof public.profiles%ROWTYPE;
  v_old_payment uuid;
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
    RETURN jsonb_build_object('ok', true, 'already_verified', true, 'plan_tier', COALESCE(prof.plan_tier, pay.target_tier));
  END IF;
  IF pay.status NOT IN ('created', 'failed') THEN
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

  -- A suspended doctor cannot buy their way out of suspension; the money is
  -- recorded and flagged for manual refund instead.
  IF prof.plan_status = 'cancelled' THEN
    INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, details)
    VALUES (NULL, 'plan_payment_not_applied_suspended', 'plan_upgrade_payments', pay.id,
      jsonb_build_object('doctor_id', pay.doctor_id, 'target_tier', pay.target_tier, 'amount', pay.amount));
    RETURN jsonb_build_object('ok', false, 'code', 'suspended');
  END IF;

  -- Live paid plan -> schedule for the end of the current period.
  IF prof.plan_status = 'active' AND prof.plan_end IS NOT NULL AND prof.plan_end > now() THEN
    SELECT payment_id INTO v_old_payment FROM public.pending_plans WHERE doctor_id = pay.doctor_id LIMIT 1;
    IF v_old_payment IS NOT NULL AND v_old_payment IS DISTINCT FROM pay.id THEN
      INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, details)
      VALUES (NULL, 'superseded_scheduled_plan_needs_refund', 'plan_upgrade_payments', v_old_payment,
        jsonb_build_object('doctor_id', pay.doctor_id, 'replaced_by_payment', pay.id));
    END IF;
    DELETE FROM public.pending_plans WHERE doctor_id = pay.doctor_id;
    INSERT INTO public.pending_plans (doctor_id, target_tier, activation_date, payment_id)
    VALUES (pay.doctor_id, pay.target_tier, prof.plan_end, pay.id);
    RETURN jsonb_build_object('ok', true, 'plan_tier', pay.target_tier, 'scheduled', true,
      'activation_date', prof.plan_end);
  END IF;

  -- No live paid plan (trial, expired, lapsed, or manual plan with no end) -> immediate.
  UPDATE public.profiles
  SET plan_tier = pay.target_tier,
      plan_status = 'active',
      trial_end = NULL,
      plan_end = now() + interval '30 days'
  WHERE id = pay.doctor_id;
  RETURN jsonb_build_object('ok', true, 'plan_tier', pay.target_tier, 'scheduled', false);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_plan_upgrade_payment(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_plan_upgrade_payment(uuid, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
