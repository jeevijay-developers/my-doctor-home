-- Database security / logic fixes found by the test suite (tests/FIX_PLAN.md, package DB).
-- Every statement is idempotent. Nothing here drops data.
--
--  (a) get_or_create_dev_user: service_role only + pinned search_path
--  (b) guard_appointment_writes / enforce_public_booking_limits: NULL-safe "is this the clinic?" test
--  (c) staff_members: a staff caller cannot grant permissions they do not hold
--  (d) profiles: superadmin-team writes are split by column group
--  (e) patient_queries: no direct anonymous insert (the submit-patient-query edge function does it)
--  (f) patients: no direct anonymous insert (public bookings create patients via sync_appointment_patient)
--  (h) get_upcoming_checkup: requires the booking token, locked out like the other token lookups
--  (i) token lockout can no longer be reset by a successful lookup of an unrelated booking
--  (j) reschedule_appointment_by_token / get_appointment_by_token type errors
--  +   profiles.bio column (Onboarding collects it)

-- ---------------------------------------------------------------------------------------
-- (a) get_or_create_dev_user: only mock-otp-login (service role) calls it.
-- ---------------------------------------------------------------------------------------
ALTER FUNCTION public.get_or_create_dev_user(text, text, boolean) SET search_path = public;
REVOKE ALL ON FUNCTION public.get_or_create_dev_user(text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_or_create_dev_user(text, text, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.get_or_create_dev_user(text, text, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_dev_user(text, text, boolean) TO service_role;

-- ---------------------------------------------------------------------------------------
-- (b) A signed-in user who is neither the doctor nor active staff made v_clinic NULL
--     (staff_doctor_id() is NULL), so `IF NOT v_clinic` was not taken and they got the
--     clinic branch (completed/paid bookings on someone else's clinic). COALESCE to false.
-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_appointment_writes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_internal boolean := (auth.role() IS NULL OR auth.role() = 'service_role');
  v_clinic   boolean := COALESCE(auth.uid() IS NOT NULL
                         AND (auth.uid() = NEW.doctor_id OR public.staff_doctor_id(auth.uid()) = NEW.doctor_id), false);
  -- Set (transaction-local) by queue_action only; clients cannot set it.
  v_rpc      boolean := COALESCE(current_setting('app.queue_rpc', true), '') = '1';
  v_today    date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  taken      integer;
BEGIN
  -- Cron jobs, edge functions on the service key and migrations are trusted.
  IF v_internal THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT v_clinic THEN
      -- Public booking: always a plain unpaid-or-pay-at-clinic pending request for a real,
      -- future slot, stamped with the server's clock (it decides the order in the queue).
      NEW.status := 'pending';
      NEW.payment_status := CASE WHEN NEW.payment_status::text = 'pending'
                                 THEN 'pending'::public.payment_status
                                 ELSE 'pay_at_clinic'::public.payment_status END;
      NEW.payment_gateway := NULL; NEW.gateway_order_id := NULL;
      NEW.gateway_payment_id := NULL; NEW.gateway_signature := NULL;
      NEW.meeting_link := NULL; NEW.meeting_provider := NULL; NEW.meeting_status := NULL;
      NEW.zoom_meeting_id := NULL; NEW.zoom_join_url := NULL; NEW.zoom_start_url := NULL;
      NEW.reschedule_count := 0;
      NEW.payment_method := NULL; NEW.paid_at := NULL;
      NEW.serving_started_at := NULL; NEW.skipped_at := NULL; NEW.completed_at := NULL;
      NEW.priority := 0; NEW.priority_reason := NULL;
      NEW.patient_id := NULL; NEW.visit_counted := false;
      NEW.amount := GREATEST(COALESCE(NEW.amount, 0), 0);
      NEW.created_at := now();
      IF NEW.time_slot IS NULL THEN
        RAISE EXCEPTION 'TIME_SLOT_REQUIRED' USING ERRCODE = 'check_violation';
      END IF;
      IF NEW.date IS NULL OR NEW.date < v_today THEN
        RAISE EXCEPTION 'SLOT_IN_PAST' USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      -- Doctor/staff booking: may record a counter payment, never a gateway one.
      NEW.payment_gateway := NULL; NEW.gateway_order_id := NULL;
      NEW.gateway_payment_id := NULL; NEW.gateway_signature := NULL;
      IF NEW.payment_status::text = 'refunded' THEN
        NEW.payment_status := 'pending';
      END IF;
      IF NEW.payment_status::text = 'paid' THEN
        NEW.payment_method := COALESCE(NEW.payment_method, 'cash');
        NEW.paid_at := COALESCE(NEW.paid_at, now());
      END IF;
      -- Queue state starts clean: it is changed only through queue_action.
      NEW.serving_started_at := NULL; NEW.skipped_at := NULL;
      NEW.priority := 0; NEW.priority_reason := NULL;
      NEW.patient_id := NULL; NEW.visit_counted := false;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.payment_gateway IS DISTINCT FROM OLD.payment_gateway
     OR NEW.gateway_order_id IS DISTINCT FROM OLD.gateway_order_id
     OR NEW.gateway_payment_id IS DISTINCT FROM OLD.gateway_payment_id
     OR NEW.gateway_signature IS DISTINCT FROM OLD.gateway_signature THEN
    RAISE EXCEPTION 'GATEWAY_FIELDS_LOCKED' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    IF NOT v_clinic THEN
      RAISE EXCEPTION 'PAYMENT_STATUS_LOCKED' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.payment_status::text = 'refunded' THEN
      RAISE EXCEPTION 'REFUND_VIA_REFUND_FLOW' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.payment_gateway IS NOT NULL AND OLD.payment_status::text = 'paid' THEN
      RAISE EXCEPTION 'ONLINE_PAYMENT_LOCKED' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.payment_status::text = 'paid' THEN
      NEW.payment_method := COALESCE(NEW.payment_method, 'cash');
      NEW.paid_at := COALESCE(NEW.paid_at, now());
    END IF;
  END IF;

  IF NEW.amount IS DISTINCT FROM OLD.amount
     AND OLD.payment_gateway IS NOT NULL AND OLD.payment_status::text = 'paid' THEN
    RAISE EXCEPTION 'ONLINE_PAYMENT_LOCKED' USING ERRCODE = 'check_violation';
  END IF;

  -- The order of the line and its audit trail live behind queue_action (priority needs a
  -- reason, every move is logged). Nobody can edit them, or the arrival time, directly.
  IF NOT v_rpc AND (
       NEW.queue_number       IS DISTINCT FROM OLD.queue_number
    OR NEW.priority           IS DISTINCT FROM OLD.priority
    OR NEW.priority_reason    IS DISTINCT FROM OLD.priority_reason
    OR NEW.serving_started_at IS DISTINCT FROM OLD.serving_started_at
    OR NEW.skipped_at         IS DISTINCT FROM OLD.skipped_at
    OR NEW.sort_time          IS DISTINCT FROM OLD.sort_time
    OR NEW.created_at         IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'QUEUE_FIELDS_LOCKED' USING ERRCODE = 'check_violation';
  END IF;

  -- Re-opening a cancelled booking takes its slot again: staff (not the doctor, who may
  -- overbook on purpose) must respect "one active booking per slot".
  IF v_clinic AND v_uid <> NEW.doctor_id
     AND OLD.status::text = 'cancelled' AND NEW.status::text <> 'cancelled'
     AND NEW.time_slot IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(
      NEW.doctor_id::text || ':' || NEW.date::text || ':' || NEW.time_slot::text || ':' || NEW.appointment_type, 0));
    SELECT COUNT(*) INTO taken FROM public.appointments
     WHERE doctor_id = NEW.doctor_id AND date = NEW.date AND time_slot = NEW.time_slot
       AND appointment_type = NEW.appointment_type AND status <> 'cancelled' AND id <> NEW.id;
    IF taken >= 1 THEN
      RAISE EXCEPTION 'SLOT_FULL' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

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
BEGIN
  -- Staff bookings, cron and the payment edge function (service key) are trusted.
  IF v_internal OR v_clinic THEN
    RETURN NEW;
  END IF;

  IF length(regexp_replace(COALESCE(NEW.patient_phone, ''), '\D', '', 'g')) < 10 THEN
    RAISE EXCEPTION 'PHONE_REQUIRED' USING ERRCODE = 'check_violation';
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
  NEW.amount := public.public_booking_price(NEW.doctor_id, NEW.service_name, NEW.appointment_type::text);
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------------------
-- (c) staff_members: delegation guard. A staff caller (staff_doctor_id(auth.uid()) not null)
--     may only hand out permissions they hold themselves, and never touch their own row.
--     Doctors (owner of the tenant), superadmins and service-role paths are unchanged.
-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_staff_member_delegation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  k text;
  v jsonb;
BEGIN
  IF v_uid IS NULL OR public.staff_doctor_id(v_uid) IS NULL THEN
    RETURN NEW;  -- not a staff caller: doctor / service / superadmin paths are governed by RLS
  END IF;

  IF NEW.id = v_uid THEN
    RAISE EXCEPTION 'Staff cannot create or change their own staff record' USING ERRCODE = '42501';
  END IF;
  IF NEW.doctor_id IS DISTINCT FROM public.staff_doctor_id(v_uid) THEN
    RAISE EXCEPTION 'Staff can only manage staff of their own clinic' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.doctor_id IS DISTINCT FROM OLD.doctor_id THEN
    RAISE EXCEPTION 'Staff cannot move a staff member to another clinic' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(COALESCE(NEW.permissions, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'permissions must be a JSON object' USING ERRCODE = '42501';
  END IF;

  FOR k, v IN SELECT key, value FROM jsonb_each(COALESCE(NEW.permissions, '{}'::jsonb)) LOOP
    CONTINUE WHEN v IN ('false'::jsonb, 'null'::jsonb);
    -- newly granted (or newly inserted) key: the caller must hold it
    IF TG_OP = 'UPDATE' AND OLD.permissions -> k IS NOT DISTINCT FROM v THEN
      CONTINUE;
    END IF;
    IF NOT public.staff_has_permission(v_uid, k) THEN
      RAISE EXCEPTION 'Cannot grant a permission you do not hold: %', k USING ERRCODE = '42501';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_staff_member_delegation ON public.staff_members;
CREATE TRIGGER trg_guard_staff_member_delegation
  BEFORE INSERT OR UPDATE ON public.staff_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_staff_member_delegation();

-- ---------------------------------------------------------------------------------------
-- (d) profiles: split the superadmin-team write by column group.
--     owner (user_roles admin), the doctor themself and staff (own guard) are unchanged.
--       subscriptions.manage -> plan / trial / price / commission columns
--       razorpay_*           -> owner only (written by edge functions on the service role)
--       anything else        -> doctors.edit
-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_team_profile_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  k text;
  v_plan_cols text[] := ARRAY['plan_tier','plan_status','plan_end','trial_start','trial_end',
                              'custom_plan_price','commission_percent'];
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF v_uid IS NULL                                  -- cron / service / migrations
     OR v_uid = OLD.id                              -- the doctor (plan columns: guard_doctor_plan_columns)
     OR public.has_role(v_uid, 'admin')             -- platform owner
     OR public.staff_doctor_id(v_uid) IS NOT NULL   -- staff (guard_staff_profile_update)
     OR current_setting('app.plan_write_ok', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NOT public.is_active_team_member(v_uid) THEN
    RETURN NEW;  -- RLS decides; this guard only narrows team members
  END IF;

  v_old := to_jsonb(OLD); v_new := to_jsonb(NEW);
  FOR k IN SELECT key FROM jsonb_each(v_new) LOOP
    CONTINUE WHEN v_new -> k IS NOT DISTINCT FROM v_old -> k;
    CONTINUE WHEN k = 'updated_at';
    IF k = ANY (v_plan_cols) THEN
      IF NOT public.sa_has_permission(v_uid, 'subscriptions.manage') THEN
        RAISE EXCEPTION 'subscriptions.manage is required to change %', k USING ERRCODE = '42501';
      END IF;
    ELSIF k LIKE 'razorpay\_%' THEN
      RAISE EXCEPTION 'Payout account columns can only be changed by the platform owner' USING ERRCODE = '42501';
    ELSE
      IF NOT public.sa_has_permission(v_uid, 'doctors.edit') THEN
        RAISE EXCEPTION 'doctors.edit is required to change %', k USING ERRCODE = '42501';
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_team_profile_update ON public.profiles;
CREATE TRIGGER trg_guard_team_profile_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_team_profile_update();

-- ---------------------------------------------------------------------------------------
-- (e) patient_queries: only the submit-patient-query edge function (service role) inserts.
-- (f) patients: public bookings create patients through sync_appointment_patient
--     (SECURITY DEFINER trigger on appointments), so the open anon insert is not needed.
-- ---------------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can create patient queries" ON public.patient_queries;
REVOKE INSERT ON public.patient_queries FROM anon;

DROP POLICY IF EXISTS "Public can create patients for valid doctors" ON public.patients;
REVOKE INSERT ON public.patients FROM anon;

-- ---------------------------------------------------------------------------------------
-- (i) A successful lookup used to delete the (clinic, phone) failure counter. The booking token
--     is client-chosen and the phone unverified, so an attacker could book on the victim's phone,
--     then alternate 7 guesses with one successful lookup of that own booking forever.
--     Success now only prunes expired windows; failures age out on their own after 15 minutes.
-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.token_lookup_ok(_doctor_id uuid, _phone text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  DELETE FROM public.token_lookup_attempts
   WHERE doctor_id = _doctor_id AND phone = _phone
     AND window_start < now() - interval '15 minutes';
$function$;

-- ---------------------------------------------------------------------------------------
-- (j) get_appointment_by_token: RETURNS TABLE declares text / numeric, the query returned time / integer.
-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_appointment_by_token(_doctor_id uuid, _token text, _phone text)
 RETURNS TABLE(id uuid, doctor_id uuid, patient_name text, patient_phone text, service_name text, appointment_type text, date date, time_slot text, status text, token_number text, amount numeric, reschedule_count integer, chief_complaint text, meeting_link text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF length(btrim(COALESCE(_phone, ''))) < 10 THEN
    RETURN;
  END IF;
  IF public.token_lookup_blocked(_doctor_id, _phone) THEN
    RAISE EXCEPTION 'TOO_MANY_ATTEMPTS';
  END IF;

  RETURN QUERY
    SELECT a.id, a.doctor_id, a.patient_name, a.patient_phone, a.service_name,
           a.appointment_type, a.date, a.time_slot::text, a.status::text, a.token_number,
           a.amount::numeric, a.reschedule_count, a.chief_complaint, a.meeting_link, a.created_at
      FROM public.appointments a
     WHERE a.doctor_id = _doctor_id
       AND a.token_number = _token
       AND a.patient_phone = _phone
     ORDER BY a.date DESC, a.created_at DESC
     LIMIT 1;

  IF FOUND THEN
    PERFORM public.token_lookup_ok(_doctor_id, _phone);
  ELSE
    PERFORM public.token_lookup_failed(_doctor_id, _phone);
  END IF;
END;
$function$;

-- reschedule: time_slot is `time`; the comparison/assignment with text raised 42883.
CREATE OR REPLACE FUNCTION public.reschedule_appointment_by_token(_doctor_id uuid, _token text, _phone text, _new_date date, _new_time text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  appt public.appointments%ROWTYPE;
  cutoff integer;
  taken integer;
  auto_conf boolean;
  new_t time;
BEGIN
  IF length(btrim(COALESCE(_phone, ''))) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  END IF;
  IF public.token_lookup_blocked(_doctor_id, _phone) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TOO_MANY_ATTEMPTS');
  END IF;

  SELECT * INTO appt FROM public.appointments
   WHERE doctor_id = _doctor_id AND token_number = _token AND patient_phone = _phone
   ORDER BY date DESC, created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    PERFORM public.token_lookup_failed(_doctor_id, _phone);
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  END IF;
  PERFORM public.token_lookup_ok(_doctor_id, _phone);

  IF appt.status NOT IN ('pending', 'confirmed') OR appt.serving_started_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_RESCHEDULABLE');
  END IF;
  IF appt.reschedule_count >= 2 THEN RETURN jsonb_build_object('ok', false, 'error', 'MAX_RESCHEDULES'); END IF;
  IF _new_date IS NULL OR _new_time IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID');
  END IF;
  BEGIN
    new_t := _new_time::time;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID');
  END;

  SELECT COALESCE(cancellation_cutoff_hours, 2), COALESCE(auto_confirm, false)
    INTO cutoff, auto_conf FROM public.website_settings WHERE doctor_id = _doctor_id;
  cutoff := COALESCE(cutoff, 2);

  IF appt.time_slot IS NOT NULL
     AND ((appt.date::text || ' ' || appt.time_slot::text)::timestamp AT TIME ZONE 'Asia/Kolkata') - now() < make_interval(hours => cutoff) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TOO_CLOSE');
  END IF;
  IF ((_new_date::text || ' ' || new_t::text)::timestamp AT TIME ZONE 'Asia/Kolkata') < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SLOT_IN_PAST');
  END IF;

  -- same lock key as the slot-capacity triggers (time_slot::text)
  PERFORM pg_advisory_xact_lock(hashtextextended(
    _doctor_id::text || ':' || _new_date::text || ':' || new_t::text || ':' || appt.appointment_type, 0));

  SELECT COUNT(*) INTO taken FROM public.appointments
   WHERE doctor_id = _doctor_id AND date = _new_date AND time_slot = new_t
     AND appointment_type = appt.appointment_type AND status <> 'cancelled' AND id <> appt.id;
  IF taken >= 1 THEN RETURN jsonb_build_object('ok', false, 'error', 'SLOT_FULL'); END IF;

  UPDATE public.appointments SET date = _new_date, time_slot = new_t,
    reschedule_count = reschedule_count + 1,
    status = CASE WHEN auto_conf THEN 'confirmed'::appointment_status ELSE 'pending'::appointment_status END,
    updated_at = now()
   WHERE id = appt.id;
  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- ---------------------------------------------------------------------------------------
-- (h) get_upcoming_checkup: now needs the booking token as well as the phone.
--     Wrong token -> counts toward the same (clinic, phone) lockout as get_appointment_by_token,
--     plus a per-clinic ceiling (30 failed calls / 15 min) that stops sweeping many phone numbers.
--     The old two-argument form is dropped. APP CHANGE: ManageAppointment.tsx must pass
--     `_token: row.token_number` (until then the "next check-up" card is simply not shown).
-- ---------------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_upcoming_checkup(uuid, text);

CREATE OR REPLACE FUNCTION public.get_upcoming_checkup(_doctor_id uuid, _phone text, _token text DEFAULT NULL)
 RETURNS TABLE(doctor_name text, next_checkup_date date, frequency checkup_frequency, reminder_enabled boolean)
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ok boolean := false;
  v_sweep_blocked boolean;
BEGIN
  IF length(btrim(COALESCE(_phone, ''))) >= 10 AND COALESCE(_token, '') <> '' THEN
    IF public.token_lookup_blocked(_doctor_id, _phone) THEN
      RAISE EXCEPTION 'TOO_MANY_ATTEMPTS';
    END IF;
    v_ok := EXISTS (SELECT 1 FROM public.appointments a
                     WHERE a.doctor_id = _doctor_id AND a.token_number = _token AND a.patient_phone = _phone);
    IF NOT v_ok THEN
      PERFORM public.token_lookup_failed(_doctor_id, _phone);
    END IF;
  END IF;

  IF NOT v_ok THEN
    SELECT EXISTS (SELECT 1 FROM public.token_lookup_attempts
                    WHERE doctor_id = _doctor_id AND phone = '*checkup-sweep*'
                      AND failures >= 30 AND window_start > now() - interval '15 minutes')
      INTO v_sweep_blocked;
    IF v_sweep_blocked THEN
      RAISE EXCEPTION 'TOO_MANY_ATTEMPTS';
    END IF;
    PERFORM public.token_lookup_failed(_doctor_id, '*checkup-sweep*');
    RETURN;
  END IF;

  RETURN QUERY
    SELECT p.full_name, r.next_checkup_date, r.frequency, true
      FROM public.patient_checkup_reminders r
      JOIN public.patients pt ON pt.id = r.patient_id
      JOIN public.profiles p ON p.id = r.doctor_id
     WHERE r.doctor_id = _doctor_id
       AND pt.phone = _phone
       AND r.status = 'active'
     ORDER BY r.next_checkup_date ASC
     LIMIT 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_upcoming_checkup(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_upcoming_checkup(uuid, text, text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------
-- profiles.bio: Onboarding collects a bio but the column did not exist (silently dropped).
-- No column-level grants are involved, so the doctor's own UPDATE and public SELECT work.
-- ---------------------------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_bio_length'
                   AND conrelid = 'public.profiles'::regclass) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_bio_length CHECK (bio IS NULL OR char_length(bio) <= 2000) NOT VALID;
    ALTER TABLE public.profiles VALIDATE CONSTRAINT profiles_bio_length;
  END IF;
END $$;
