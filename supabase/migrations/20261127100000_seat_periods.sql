-- Multi-doctor P3 (DB1): extra doctor seats become DATED PERIODS bought by the clinic owner.
--
--  * clinic_seat_periods: seats a clinic paid for, each with a start and an end.
--  * clinic_doctor_seat_limit() counts only periods that are active RIGHT NOW (plus the seats a
--    superadmin grants in clinic_doctor_seats). An ended period stops counting by itself, so a
--    late or missed cron can never grant a free seat, and the renewal cron is not touched.
--  * seat orders reuse plan_upgrade_payments (+ kind) and the locked, idempotent
--    apply_plan_upgrade_payment(); the amount is computed in SQL (seat_order_quote), never by a client.
--  * doctor_seat_price stays NULL in this migration: every purchase is refused PRICE_NOT_SET until
--    the owner sets a price.
-- Single-doctor clinics and clinics with the feature off keep exactly 1 seat.

-- 1. plan_upgrade_payments: what an order is for ----------------------------------------------
ALTER TABLE public.plan_upgrade_payments
  ADD COLUMN IF NOT EXISTS kind          text NOT NULL DEFAULT 'plan',
  ADD COLUMN IF NOT EXISTS seats_quantity integer,
  ADD COLUMN IF NOT EXISTS unit_price    numeric,
  ADD COLUMN IF NOT EXISTS period_start  timestamptz,
  ADD COLUMN IF NOT EXISTS period_end    timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.plan_upgrade_payments'::regclass
                   AND conname = 'plan_upgrade_payments_kind_check') THEN
    ALTER TABLE public.plan_upgrade_payments
      ADD CONSTRAINT plan_upgrade_payments_kind_check CHECK (kind IN ('plan', 'seats'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.plan_upgrade_payments'::regclass
                   AND conname = 'plan_upgrade_payments_seats_check') THEN
    ALTER TABLE public.plan_upgrade_payments
      ADD CONSTRAINT plan_upgrade_payments_seats_check
      CHECK ((seats_quantity IS NULL OR seats_quantity > 0) AND (kind <> 'seats' OR seats_quantity IS NOT NULL));
  END IF;
END $$;

-- 2. clinic_seat_periods ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clinic_seat_periods (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  quantity   integer NOT NULL CHECK (quantity > 0),
  starts_at  timestamptz NOT NULL,
  ends_at    timestamptz NOT NULL,
  payment_id uuid UNIQUE REFERENCES public.plan_upgrade_payments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clinic_seat_periods_range CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_clinic_seat_periods_doctor_end ON public.clinic_seat_periods (doctor_id, ends_at);

ALTER TABLE public.clinic_seat_periods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Clinic members can view their seat periods" ON public.clinic_seat_periods;
CREATE POLICY "Clinic members can view their seat periods" ON public.clinic_seat_periods
  FOR SELECT TO authenticated
  USING (auth.uid() = doctor_id
         OR public.staff_doctor_id(auth.uid()) = doctor_id
         OR public.has_role(auth.uid(), 'admin')
         OR COALESCE(public.sa_has_any_permission(auth.uid(), ARRAY['billing.view', 'subscriptions.view']), false));
-- No client write policy exists; make the grants say so too.
REVOKE ALL ON public.clinic_seat_periods FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.clinic_seat_periods FROM authenticated;
GRANT SELECT ON public.clinic_seat_periods TO authenticated;

-- 3. The seat limit: 1 + superadmin grants + seats bought for NOW (+ trial seat), capped. ------
CREATE OR REPLACE FUNCTION public.clinic_doctor_seat_limit(_doctor_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_limit integer := 1;
BEGIN
  IF NOT public.clinic_multi_doctor_enabled(_doctor_id) THEN
    RETURN 1;
  END IF;
  v_limit := v_limit + COALESCE((SELECT extra_seats FROM public.clinic_doctor_seats WHERE doctor_id = _doctor_id), 0);
  v_limit := v_limit + COALESCE((SELECT sum(quantity)::integer FROM public.clinic_seat_periods
                                  WHERE doctor_id = _doctor_id AND starts_at <= now() AND ends_at > now()), 0);
  IF EXISTS (SELECT 1 FROM public.profiles
              WHERE id = _doctor_id AND plan_status = 'trial' AND (trial_end IS NULL OR trial_end > now())) THEN
    v_limit := v_limit + public.platform_int_setting('trial_extra_doctor_seats', 1);
  END IF;
  RETURN LEAST(v_limit, public.platform_int_setting('doctor_seat_max', 15));
END;
$$;
REVOKE ALL ON FUNCTION public.clinic_doctor_seat_limit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clinic_doctor_seat_limit(uuid) TO authenticated, service_role;

-- 4. The quote. The ONLY place a seat order's amount comes from. ------------------------------
--   amount = ceil(qty * price * 100 * min(days_left, 30) / 30) paise, at least 100.
--   Only Premium + active + a real plan_end with at least 1 hour left can buy (no trial, Pro or Free).
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

  IF _qty IS NULL OR _qty < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_QTY');
  END IF;

  v_granted := COALESCE((SELECT extra_seats FROM public.clinic_doctor_seats WHERE doctor_id = _doctor_id), 0);
  v_active  := COALESCE((SELECT sum(quantity)::integer FROM public.clinic_seat_periods
                          WHERE doctor_id = _doctor_id AND starts_at <= now() AND ends_at > now()), 0);
  IF v_granted + v_active + _qty > v_max - 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SEAT_MAX');
  END IF;

  v_days := extract(epoch FROM (prof.plan_end - now())) / 86400;
  v_amount := GREATEST(100, ceil(_qty * v_price * 100 * LEAST(v_days, 30) / 30));
  RETURN jsonb_build_object(
    'ok', true,
    'amount_paise', v_amount::bigint,
    'unit_price', v_price,
    'days_left', round(v_days, 4),
    'period_end', prof.plan_end
  );
END;
$$;
REVOKE ALL ON FUNCTION public.seat_order_quote(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seat_order_quote(uuid, integer) TO service_role;

-- The signed-in owner (or staff with billing.manage) asks for a quote for THEIR clinic.
CREATE OR REPLACE FUNCTION public.get_seat_order_quote(_qty integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_clinic uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;
  v_clinic := CASE
    WHEN EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid) THEN v_uid
    WHEN COALESCE(public.staff_has_permission(v_uid, 'billing.manage'), false) THEN public.staff_doctor_id(v_uid)
  END;
  IF v_clinic IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;
  RETURN public.seat_order_quote(v_clinic, _qty);
END;
$$;
REVOKE ALL ON FUNCTION public.get_seat_order_quote(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_seat_order_quote(integer) TO authenticated;

-- 5. Seats bought inside a renewal order. Internal: called only by apply_plan_upgrade_payment. --
CREATE OR REPLACE FUNCTION public.grant_renewal_seat_period(_payment_id uuid, _doctor_id uuid, _qty integer, _starts_at timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_room integer;
  v_qty  integer;
BEGIN
  IF _qty IS NULL OR _qty < 1 THEN
    RETURN;
  END IF;
  v_room := GREATEST(0, public.platform_int_setting('doctor_seat_max', 15) - 1
                        - COALESCE((SELECT extra_seats FROM public.clinic_doctor_seats WHERE doctor_id = _doctor_id), 0));
  v_qty := LEAST(_qty, v_room);
  IF v_qty < _qty THEN
    INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, details)
    VALUES (NULL, 'renewal_seats_clamped', 'plan_upgrade_payments', _payment_id,
      jsonb_build_object('doctor_id', _doctor_id, 'ordered', _qty, 'applied', v_qty));
  END IF;
  IF v_qty < 1 THEN
    RETURN;
  END IF;
  INSERT INTO public.clinic_seat_periods (doctor_id, quantity, starts_at, ends_at, payment_id)
  VALUES (_doctor_id, v_qty, _starts_at, _starts_at + interval '30 days', _payment_id)
  ON CONFLICT (payment_id) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.grant_renewal_seat_period(uuid, uuid, integer, timestamptz) FROM PUBLIC, anon, authenticated;

-- 6. apply_plan_upgrade_payment: same body as live (incl. the 'abandoned' patch) plus
--    a seats branch and renewal seats. Plain plan payments take exactly the old path. ----------
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
    RETURN jsonb_build_object('ok', true, 'already_verified', true, 'plan_tier', COALESCE(prof.plan_tier, pay.target_tier))
           || CASE WHEN pay.kind = 'seats' THEN jsonb_build_object('kind', 'seats') ELSE '{}'::jsonb END;
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

  -- Extra doctor seats: re-check everything inside the lock. If the plan lapsed or was
  -- cancelled, the feature was switched off or the cap was reached between order and capture,
  -- the money is recorded and flagged for manual refund (same as the suspended case below).
  IF pay.kind = 'seats' THEN
    v_qty := COALESCE(pay.seats_quantity, 0);
    v_reason := CASE
      WHEN prof.plan_status = 'cancelled' THEN 'cancelled'
      WHEN NOT (prof.plan_tier = 'premium' AND prof.plan_status = 'active'
                AND prof.plan_end IS NOT NULL AND prof.plan_end > now()) THEN 'plan_lapsed'
      WHEN NOT COALESCE(public.clinic_multi_doctor_enabled(pay.doctor_id), false) THEN 'not_enabled'
      WHEN v_qty < 1 THEN 'invalid_qty'
      WHEN COALESCE((SELECT extra_seats FROM public.clinic_doctor_seats WHERE doctor_id = pay.doctor_id), 0)
           + COALESCE((SELECT sum(quantity)::integer FROM public.clinic_seat_periods
                        WHERE doctor_id = pay.doctor_id AND starts_at <= now() AND ends_at > now()), 0)
           + v_qty > public.platform_int_setting('doctor_seat_max', 15) - 1 THEN 'cap_exceeded'
    END;
    IF v_reason IS NOT NULL THEN
      INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, details)
      VALUES (NULL, 'seat_payment_not_applied_' || v_reason, 'plan_upgrade_payments', pay.id,
        jsonb_build_object('doctor_id', pay.doctor_id, 'seats', v_qty, 'amount', pay.amount));
      RETURN jsonb_build_object('ok', false, 'code', v_reason, 'kind', 'seats');
    END IF;
    INSERT INTO public.clinic_seat_periods (doctor_id, quantity, starts_at, ends_at, payment_id)
    VALUES (pay.doctor_id, v_qty, now(), prof.plan_end, pay.id);
    RETURN jsonb_build_object('ok', true, 'kind', 'seats', 'plan_tier', prof.plan_tier,
      'seats_quantity', v_qty, 'period_end', prof.plan_end,
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
      PERFORM public.grant_renewal_seat_period(pay.id, pay.doctor_id, v_seats, prof.plan_end);
    END IF;
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
  IF v_seats > 0 THEN
    PERFORM public.grant_renewal_seat_period(pay.id, pay.doctor_id, v_seats, now());
  END IF;
  RETURN jsonb_build_object('ok', true, 'plan_tier', pay.target_tier, 'scheduled', false);
END;
$function$;

-- 7. Access summary: every existing key, plus purchased seats and whether buying is possible. --
CREATE OR REPLACE FUNCTION public.get_clinic_doctor_access(_doctor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- COALESCE: staff_doctor_id() is NULL for a non-staff caller, and NOT (false OR NULL) is
  -- NULL, which IF would treat as "not refused".
  IF NOT COALESCE(v_uid = _doctor_id OR public.staff_doctor_id(v_uid) = _doctor_id
                  OR public.has_role(v_uid, 'admin') OR public.sa_has_permission(v_uid, 'doctors.view'), false) THEN
    RETURN jsonb_build_object('error', 'FORBIDDEN');
  END IF;
  RETURN jsonb_build_object(
    'enabled',     public.clinic_multi_doctor_enabled(_doctor_id),
    'has_feature', public.doctor_has_feature(_doctor_id, 'multi_doctor'),
    'seat_limit',  public.clinic_doctor_seat_limit(_doctor_id),
    'seats_used',  (SELECT count(*) FROM public.practitioners WHERE doctor_id = _doctor_id AND is_active AND is_bookable),
    'extra_seats', COALESCE((SELECT extra_seats FROM public.clinic_doctor_seats WHERE doctor_id = _doctor_id), 0),
    'seat_max',    public.platform_int_setting('doctor_seat_max', 15),
    'seat_price',  (SELECT value FROM public.platform_settings WHERE key = 'doctor_seat_price'),
    'purchased_seats', COALESCE((SELECT sum(quantity)::integer FROM public.clinic_seat_periods
                                  WHERE doctor_id = _doctor_id AND starts_at <= now() AND ends_at > now()), 0),
    'seats_valid_until', (SELECT min(ends_at) FROM public.clinic_seat_periods
                           WHERE doctor_id = _doctor_id AND starts_at <= now() AND ends_at > now()),
    'can_buy_seats', COALESCE((public.seat_order_quote(_doctor_id, 1) ->> 'ok')::boolean, false)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_clinic_doctor_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_clinic_doctor_access(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
