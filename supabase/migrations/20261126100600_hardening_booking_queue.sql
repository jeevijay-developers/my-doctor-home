-- Multi-doctor hardening 1: bookings, queue, doctor management, public doctor list.
-- Every function below is the LIVE definition (verified identical to the repo copy before this file
-- was written) plus the change named in its comment.
-- Check: npx supabase db query --linked -f supabase/tests/multi-doctor/11_hardening_booking_queue.sql

-- ---- 1. practitioners.user_id must be a real login ----
UPDATE public.practitioners SET user_id = NULL
 WHERE user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = user_id);
ALTER TABLE public.practitioners ADD CONSTRAINT practitioners_user_fk
  FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE SET NULL;

-- ---- 2. a notification can never fail a booking ----
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_source_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_source_type_check
  CHECK (source_type = ANY (ARRAY['ticket_reply', 'direct_message', 'broadcast', 'trial_warning', 'cap_warning',
                                  'plan_warning', 'plan_request', 'paid_no_show', 'new_booking', 'booking_refund']));

CREATE OR REPLACE FUNCTION public.notify_practitioner_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid;
BEGIN
  SELECT user_id INTO v_user FROM public.practitioners WHERE id = NEW.practitioner_id;
  -- No login, the owner's own row, or the doctor booking for themselves: nobody to tell.
  -- IS NOT DISTINCT FROM: a booking with no JWT (paid online booking via the edge function)
  -- has auth.uid() NULL and must still notify the doctor.
  IF v_user IS NULL OR v_user = NEW.doctor_id OR v_user IS NOT DISTINCT FROM auth.uid()
     OR NOT COALESCE(public.clinic_multi_doctor_enabled(NEW.doctor_id), false) THEN
    RETURN NULL;
  END IF;
  -- A booking is worth more than its notification: whatever goes wrong here is only a warning.
  BEGIN
    INSERT INTO public.notifications (doctor_id, recipient_user_id, source_type, title, message)
    VALUES (NEW.doctor_id, v_user, 'new_booking', 'New appointment',
            COALESCE(NULLIF(btrim(NEW.patient_name), ''), 'A patient') || ' booked for ' || to_char(NEW.date, 'DD Mon')
              -- time_slot is a time: format it through a timestamp (to_char has no time variant).
              || COALESCE(' at ' || to_char(('2000-01-01 ' || NEW.time_slot::text)::timestamp, 'HH12:MI AM'), ''));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_practitioner_booking failed (%): %', SQLSTATE, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

-- ---- 3. fill_practitioner ----
-- (a) online_booking=false closes the doctor to everyone except the clinic's own owner/staff and
--     trusted internal callers (service role / no JWT), not just to "anon".
-- (b) internal callers (a paid online booking made by the edge function) skip the
--     bookable/active/seat checks: a patient who already paid must not be refused because settings
--     changed meanwhile. The same-clinic check stays.
-- (c) validating in booking mode locks the doctor row FOR SHARE, so a concurrent
--     set_practitioner_status deactivation (FOR UPDATE) serialises with it.
-- (d) a doctor login neither creates bookings nor moves one to another doctor (reception books;
--     queue_action sets app.queue_rpc for the moves it owns).
CREATE OR REPLACE FUNCTION public.fill_practitioner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_mode   text := TG_ARGV[0];
  v_uid    uuid := auth.uid();
  v_caller uuid;
  v_parent uuid;
  v_pid    uuid;
  v_ids    uuid[];
  p        public.practitioners%ROWTYPE;
  v_internal boolean := (auth.role() IS NULL OR auth.role() = 'service_role');
  v_clinic   boolean := COALESCE(v_uid IS NOT NULL
                         AND (v_uid = NEW.doctor_id OR public.staff_doctor_id(v_uid) = NEW.doctor_id), false);
BEGIN
  IF v_mode = 'booking' AND NOT v_internal AND COALESCE(public.is_doctor_login(NEW.doctor_id), false) THEN
    IF TG_OP = 'INSERT'
       OR (NEW.practitioner_id IS DISTINCT FROM OLD.practitioner_id
           AND COALESCE(current_setting('app.queue_rpc', true), '') <> '1') THEN
      RAISE EXCEPTION 'DOCTOR_LOGIN_FORBIDDEN' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'prescriptions' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.created_by := COALESCE(v_uid, NEW.created_by);
    END IF;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.practitioner_id IS NULL THEN
    IF v_uid IS NOT NULL THEN
      SELECT id INTO v_caller FROM public.practitioners
       WHERE doctor_id = NEW.doctor_id AND user_id = v_uid AND is_active;
    END IF;

    IF TG_TABLE_NAME = 'patient_visits' THEN
      IF NEW.appointment_id IS NOT NULL THEN
        SELECT practitioner_id INTO v_parent FROM public.appointments
         WHERE id = NEW.appointment_id AND doctor_id = NEW.doctor_id;
      END IF;
    ELSIF TG_TABLE_NAME IN ('prescriptions', 'patient_documents') THEN
      IF NEW.visit_id IS NOT NULL THEN
        SELECT practitioner_id INTO v_parent FROM public.patient_visits
         WHERE id = NEW.visit_id AND doctor_id = NEW.doctor_id;
      END IF;
    END IF;

    v_pid := CASE v_mode
               WHEN 'author'   THEN COALESCE(v_caller, v_parent)
               WHEN 'visit'    THEN COALESCE(v_parent, v_caller)
               WHEN 'optional' THEN COALESCE(v_parent, v_caller)
             END;

    IF v_pid IS NULL AND v_mode <> 'optional' THEN
      IF v_mode = 'booking' THEN
        -- Only doctors within the clinic's seats can be auto-picked (a downgraded clinic falls
        -- back to its primary instead of failing every booking).
        SELECT array_agg(id) INTO v_ids FROM (
          SELECT id FROM public.practitioners
           WHERE doctor_id = NEW.doctor_id AND is_active AND is_bookable
           ORDER BY is_primary DESC, sort_order, created_at, id
           LIMIT public.clinic_doctor_seat_limit(NEW.doctor_id)) s;
      ELSE
        SELECT array_agg(id) INTO v_ids FROM public.practitioners
         WHERE doctor_id = NEW.doctor_id AND is_active;
      END IF;
      IF v_ids IS NULL AND NOT EXISTS (SELECT 1 FROM public.practitioners WHERE doctor_id = NEW.doctor_id) THEN
        -- A clinic created before its practitioner (any trigger order): make it now.
        v_pid := public.ensure_primary_practitioner(NEW.doctor_id);
      ELSIF v_ids IS NULL THEN
        RAISE EXCEPTION 'PRACTITIONER_NOT_BOOKABLE' USING ERRCODE = 'check_violation';
      ELSIF array_length(v_ids, 1) = 1 THEN
        v_pid := v_ids[1];
      ELSE
        -- Never guess between doctors: a paid booking must not land in the wrong queue.
        RAISE EXCEPTION 'PRACTITIONER_REQUIRED' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    NEW.practitioner_id := v_pid;
  END IF;

  IF NEW.practitioner_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.practitioner_id IS DISTINCT FROM OLD.practitioner_id) THEN
    IF v_mode = 'booking' THEN
      SELECT * INTO p FROM public.practitioners
       WHERE id = NEW.practitioner_id AND doctor_id = NEW.doctor_id FOR SHARE;
    ELSE
      SELECT * INTO p FROM public.practitioners WHERE id = NEW.practitioner_id AND doctor_id = NEW.doctor_id;
    END IF;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRACTITIONER_MISMATCH' USING ERRCODE = 'check_violation';
    END IF;
    IF v_mode = 'booking' AND NOT v_internal THEN
      IF NOT (p.is_active AND p.is_bookable)
         OR (NOT v_clinic AND NOT p.online_booking) THEN
        RAISE EXCEPTION 'PRACTITIONER_NOT_BOOKABLE' USING ERRCODE = 'check_violation';
      END IF;
      IF NOT COALESCE(public.practitioner_within_seats(p.id), false) THEN
        RAISE EXCEPTION 'SEAT_LIMIT' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ---- 4. renumber_rescheduled_appointment ----
-- A closed visit (completed, cancelled, no-show) keeps its doctor unless queue_action / reassign
-- moves it, and keeps its serving history when its date changes.
CREATE OR REPLACE FUNCTION public.renumber_rescheduled_appointment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF NEW.practitioner_id IS DISTINCT FROM OLD.practitioner_id THEN
    IF OLD.serving_started_at IS NOT NULL AND OLD.status::text IN ('pending', 'confirmed') THEN
      RAISE EXCEPTION 'PRACTITIONER_IN_SERVICE' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.status::text NOT IN ('pending', 'confirmed') AND COALESCE(current_setting('app.queue_rpc', true), '') <> '1' THEN
      RAISE EXCEPTION 'APPOINTMENT_CLOSED' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.date = v_today AND COALESCE(current_setting('app.queue_rpc', true), '') <> '1' THEN
      RAISE EXCEPTION 'USE_QUEUE_TRANSFER' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.date IS DISTINCT FROM OLD.date OR NEW.practitioner_id IS DISTINCT FROM OLD.practitioner_id THEN
    PERFORM pg_advisory_xact_lock(hashtext('queue_number:' || NEW.practitioner_id::text || NEW.date::text));
    SELECT COALESCE(MAX(queue_number), 0) + 1 INTO NEW.queue_number
      FROM public.appointments WHERE practitioner_id = NEW.practitioner_id AND date = NEW.date;
    IF NEW.status::text IN ('pending', 'confirmed') THEN
      NEW.serving_started_at := NULL;
      NEW.skipped_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ---- 5. queue_action_core ----
-- (a) a doctor login works only its own line (unless it holds appointments.all_doctors);
-- (b) a transfer target must be within the clinic's seats (answered, not raised as SEAT_LIMIT).
CREATE OR REPLACE FUNCTION public.queue_action_core(_action text, _appointment_id uuid, _reason text, _payment_method text, _expect text, _practitioner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_doctor uuid;
  v_pract  uuid;                          -- MD: whose line this call acts on
  v_target public.practitioners%ROWTYPE;  -- MD: transfer target
  v_ids    uuid[];
  v_keep   boolean;
  v_today  date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  a        public.appointments%ROWTYPE;
  cur      public.appointments%ROWTYPE;
  nxt      public.appointments%ROWTYPE;
  v_have   boolean;
  v_reason text := NULLIF(btrim(COALESCE(_reason, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid) THEN
    v_doctor := v_uid;
  ELSE
    v_doctor := public.staff_doctor_id(v_uid);
    IF v_doctor IS NULL OR NOT public.staff_has_permission(v_uid, 'appointments.edit') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
    END IF;
  END IF;

  IF _action NOT IN ('call_next', 'call', 'complete', 'skip', 'recall', 'no_show',
                     'set_priority', 'clear_priority', 'mark_paid', 'transfer') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'UNKNOWN_ACTION');
  END IF;

  -- MD: resolve the doctor's line.
  IF _action = 'call_next' THEN
    IF _practitioner_id IS NOT NULL THEN
      SELECT id INTO v_pract FROM public.practitioners WHERE id = _practitioner_id AND doctor_id = v_doctor;
      IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'PRACTITIONER_NOT_FOUND');
      END IF;
    ELSE
      SELECT array_agg(id) INTO v_ids FROM public.practitioners WHERE doctor_id = v_doctor AND is_active;
      IF COALESCE(array_length(v_ids, 1), 0) <> 1 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'PRACTITIONER_REQUIRED');
      END IF;
      v_pract := v_ids[1];
    END IF;
  ELSE
    SELECT practitioner_id INTO v_pract FROM public.appointments
     WHERE id = _appointment_id AND doctor_id = v_doctor;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
    END IF;
  END IF;

  -- A doctor login acts on its own doctor's line only (for a transfer, v_pract is the source
  -- line: handing a patient to a colleague is fine, pulling one from a colleague is not).
  IF COALESCE(public.is_doctor_login(v_doctor), false)
     AND NOT COALESCE(public.staff_has_permission(v_uid, 'appointments.all_doctors'), false)
     AND v_pract IS DISTINCT FROM public.my_practitioner_id(v_doctor) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;

  -- MD: one writer at a time per DOCTOR per day. A transfer changes two lines: lock both,
  -- always in uuid order, so two opposite transfers cannot deadlock.
  IF _action = 'transfer' THEN
    IF _practitioner_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'PRACTITIONER_REQUIRED');
    END IF;
    SELECT * INTO v_target FROM public.practitioners WHERE id = _practitioner_id AND doctor_id = v_doctor;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'PRACTITIONER_NOT_FOUND');
    END IF;
    IF NOT COALESCE(public.practitioner_within_seats(v_target.id), false) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'PRACTITIONER_NOT_BOOKABLE');
    END IF;
    IF v_target.id = v_pract THEN
      RETURN jsonb_build_object('ok', true, 'practitioner_id', v_pract);
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('queue:' || LEAST(v_pract, v_target.id)::text || v_today::text));
    PERFORM pg_advisory_xact_lock(hashtext('queue:' || GREATEST(v_pract, v_target.id)::text || v_today::text));
  ELSE
    PERFORM pg_advisory_xact_lock(hashtext('queue:' || v_pract::text || v_today::text));
  END IF;
  -- Lets the guard trigger accept writes to the queue columns made by this function only.
  PERFORM set_config('app.queue_rpc', '1', true);

  -- ---- call_next: finish whoever is being seen, then call the next waiting patient ----
  IF _action = 'call_next' THEN
    SELECT * INTO cur FROM public.appointments
     WHERE doctor_id = v_doctor AND practitioner_id = v_pract AND date = v_today
       AND serving_started_at IS NOT NULL AND status IN ('pending', 'confirmed')
     FOR UPDATE;
    v_have := FOUND;
    IF _expect IS NOT NULL
       AND ((_expect = 'none' AND v_have) OR (_expect <> 'none' AND (NOT v_have OR cur.id::text <> _expect))) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'STALE');
    END IF;
    IF v_have THEN
      UPDATE public.appointments SET status = 'completed' WHERE id = cur.id;
      INSERT INTO public.queue_events (doctor_id, appointment_id, actor_id, action) VALUES (v_doctor, cur.id, v_uid, 'complete');
    END IF;

    SELECT * INTO nxt FROM public.appointments
     WHERE doctor_id = v_doctor AND practitioner_id = v_pract AND date = v_today AND appointment_type = 'clinic'
       AND status IN ('pending', 'confirmed') AND skipped_at IS NULL AND serving_started_at IS NULL
     ORDER BY priority DESC, sort_time, created_at, id
     LIMIT 1
     FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', true, 'serving', NULL, 'completed', cur.id);
    END IF;
    UPDATE public.appointments SET serving_started_at = now() WHERE id = nxt.id;
    INSERT INTO public.queue_events (doctor_id, appointment_id, actor_id, action) VALUES (v_doctor, nxt.id, v_uid, 'call');
    RETURN jsonb_build_object('ok', true, 'serving', nxt.id, 'completed', cur.id);
  END IF;

  -- Everything below acts on one appointment of this clinic.
  SELECT * INTO a FROM public.appointments
   WHERE id = _appointment_id AND doctor_id = v_doctor
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  END IF;
  -- MD: moved to another doctor between our first read and the lock.
  IF a.practitioner_id <> v_pract THEN
    RETURN jsonb_build_object('ok', false, 'error', 'STALE');
  END IF;

  IF _action = 'call' THEN
    IF a.status NOT IN ('pending', 'confirmed') OR a.date <> v_today THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NOT_CALLABLE');
    END IF;
    IF a.serving_started_at IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'serving', a.id);
    END IF;
    SELECT * INTO cur FROM public.appointments
     WHERE doctor_id = v_doctor AND practitioner_id = v_pract AND date = v_today
       AND serving_started_at IS NOT NULL AND status IN ('pending', 'confirmed') AND id <> a.id
     FOR UPDATE;
    v_have := FOUND;
    IF _expect IS NOT NULL
       AND ((_expect = 'none' AND v_have) OR (_expect <> 'none' AND (NOT v_have OR cur.id::text <> _expect))) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'STALE');
    END IF;
    IF v_have THEN
      UPDATE public.appointments SET status = 'completed' WHERE id = cur.id;
      INSERT INTO public.queue_events (doctor_id, appointment_id, actor_id, action) VALUES (v_doctor, cur.id, v_uid, 'complete');
    END IF;
    UPDATE public.appointments SET serving_started_at = now(), skipped_at = NULL WHERE id = a.id;
    INSERT INTO public.queue_events (doctor_id, appointment_id, actor_id, action, reason) VALUES (v_doctor, a.id, v_uid, 'call', v_reason);
    RETURN jsonb_build_object('ok', true, 'serving', a.id, 'completed', cur.id);

  -- MD: move a waiting patient to the end of another doctor's line today.
  ELSIF _action = 'transfer' THEN
    IF a.status NOT IN ('pending', 'confirmed') OR a.date <> v_today THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NOT_TRANSFERABLE');
    END IF;
    IF a.serving_started_at IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'PRACTITIONER_IN_SERVICE');
    END IF;
    -- Keep the booked time only if it is still ahead and free with the new doctor;
    -- otherwise drop it (a late patient's 10:00 is in the past, and the line order comes
    -- from sort_time anyway, set below).
    v_keep := a.time_slot IS NOT NULL
      AND ((a.date::text || ' ' || a.time_slot)::timestamp AT TIME ZONE 'Asia/Kolkata') >= now()
      AND NOT EXISTS (SELECT 1 FROM public.appointments x
                       WHERE x.practitioner_id = v_target.id AND x.date = a.date AND x.time_slot = a.time_slot
                         AND x.appointment_type = a.appointment_type AND x.status <> 'cancelled');
    BEGIN
      UPDATE public.appointments
         SET practitioner_id = v_target.id,
             time_slot = CASE WHEN v_keep THEN time_slot ELSE NULL END,
             skipped_at = NULL
       WHERE id = a.id;
    EXCEPTION WHEN check_violation THEN
      IF SQLERRM = 'SLOT_FULL' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'SLOT_TAKEN');
      END IF;
      RAISE;
    END;
    -- MD: join the end of the line now. Separate statement because
    -- trg_set_appointment_sort_time (BEFORE UPDATE OF time_slot) recomputes sort_time from
    -- time_slot / created_at whenever time_slot is in the SET list; sort_time is an IST
    -- wall-clock time.
    UPDATE public.appointments
       SET sort_time = (now() AT TIME ZONE 'Asia/Kolkata')::time
     WHERE id = a.id
     RETURNING * INTO a;
    INSERT INTO public.queue_events (doctor_id, appointment_id, actor_id, action, reason)
    VALUES (v_doctor, a.id, v_uid, 'transfer', 'to ' || v_target.id::text || COALESCE(': ' || v_reason, ''));
    RETURN jsonb_build_object('ok', true, 'practitioner_id', v_target.id, 'queue_number', a.queue_number);

  ELSIF _action = 'complete' THEN
    IF a.status NOT IN ('pending', 'confirmed') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NOT_COMPLETABLE');
    END IF;
    UPDATE public.appointments
       SET status = 'completed', serving_started_at = COALESCE(serving_started_at, now())
     WHERE id = a.id;
    INSERT INTO public.queue_events (doctor_id, appointment_id, actor_id, action) VALUES (v_doctor, a.id, v_uid, 'complete');
    RETURN jsonb_build_object('ok', true);

  ELSIF _action = 'skip' THEN
    IF a.status NOT IN ('pending', 'confirmed') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NOT_SKIPPABLE');
    END IF;
    UPDATE public.appointments SET skipped_at = now(), serving_started_at = NULL WHERE id = a.id;
    INSERT INTO public.queue_events (doctor_id, appointment_id, actor_id, action, reason) VALUES (v_doctor, a.id, v_uid, 'skip', v_reason);
    RETURN jsonb_build_object('ok', true);

  ELSIF _action = 'recall' THEN
    IF a.skipped_at IS NULL THEN
      RETURN jsonb_build_object('ok', true);
    END IF;
    UPDATE public.appointments SET skipped_at = NULL WHERE id = a.id;
    INSERT INTO public.queue_events (doctor_id, appointment_id, actor_id, action, reason) VALUES (v_doctor, a.id, v_uid, 'recall', v_reason);
    RETURN jsonb_build_object('ok', true);

  ELSIF _action = 'no_show' THEN
    IF a.status NOT IN ('pending', 'confirmed') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NOT_MARKABLE');
    END IF;
    UPDATE public.appointments SET status = 'no_show', serving_started_at = NULL WHERE id = a.id;
    INSERT INTO public.queue_events (doctor_id, appointment_id, actor_id, action, reason) VALUES (v_doctor, a.id, v_uid, 'no_show', v_reason);
    RETURN jsonb_build_object('ok', true);

  ELSIF _action = 'set_priority' THEN
    IF v_reason IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'REASON_REQUIRED');
    END IF;
    IF a.status NOT IN ('pending', 'confirmed') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NOT_PRIORITISABLE');
    END IF;
    UPDATE public.appointments SET priority = 1, priority_reason = v_reason WHERE id = a.id;
    INSERT INTO public.queue_events (doctor_id, appointment_id, actor_id, action, reason) VALUES (v_doctor, a.id, v_uid, 'priority_on', v_reason);
    RETURN jsonb_build_object('ok', true);

  ELSIF _action = 'clear_priority' THEN
    UPDATE public.appointments SET priority = 0, priority_reason = NULL WHERE id = a.id;
    INSERT INTO public.queue_events (doctor_id, appointment_id, actor_id, action, reason) VALUES (v_doctor, a.id, v_uid, 'priority_off', v_reason);
    RETURN jsonb_build_object('ok', true);

  ELSIF _action = 'mark_paid' THEN
    IF _payment_method IS NULL OR _payment_method NOT IN ('cash', 'upi', 'card', 'other') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'PAYMENT_METHOD_REQUIRED');
    END IF;
    IF a.payment_gateway IS NOT NULL OR a.payment_status::text IN ('paid', 'refunded') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'ALREADY_SETTLED');
    END IF;
    UPDATE public.appointments
       SET payment_status = 'paid', payment_method = _payment_method, paid_at = now()
     WHERE id = a.id;
    INSERT INTO public.queue_events (doctor_id, appointment_id, actor_id, action, reason) VALUES (v_doctor, a.id, v_uid, 'mark_paid', _payment_method);
    RETURN jsonb_build_object('ok', true);
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'UNKNOWN_ACTION');
END;
$$;

-- ---- 6. reassign_practitioner_appointments ----
-- Takes the target doctor's slot locks for every affected booking up front, in sorted order
-- (a concurrent booking or reschedule holds one slot lock at a time: no deadlock). Only the
-- expected per-booking refusals leave a booking behind; anything else aborts the call.
-- "skipped" stays a uuid array; "skipped_reasons" says why, per booking.
CREATE OR REPLACE FUNCTION public.reassign_practitioner_appointments(_from uuid, _to uuid, _from_date date DEFAULT NULL::date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_clinic uuid := public.practitioner_manager_clinic();
  v_today  date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_from_date date := COALESCE(_from_date, (now() AT TIME ZONE 'Asia/Kolkata')::date);
  r record;
  v_moved integer := 0;
  v_skipped uuid[] := '{}';
  v_reasons jsonb := '[]'::jsonb;
BEGIN
  IF v_clinic IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.practitioners WHERE id = _from AND doctor_id = v_clinic)
     OR NOT EXISTS (SELECT 1 FROM public.practitioners WHERE id = _to AND doctor_id = v_clinic) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PRACTITIONER_NOT_FOUND');
  END IF;
  IF _from = _to THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID');
  END IF;
  IF NOT COALESCE(public.practitioner_within_seats(_to), false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PRACTITIONER_NOT_BOOKABLE');
  END IF;

  -- Same lock order as queue_action('transfer') for today's lines.
  PERFORM pg_advisory_xact_lock(hashtext('queue:' || LEAST(_from, _to)::text || v_today::text));
  PERFORM pg_advisory_xact_lock(hashtext('queue:' || GREATEST(_from, _to)::text || v_today::text));
  PERFORM set_config('app.queue_rpc', '1', true);

  -- Slot locks of the target doctor for every booking about to move, lowest key first.
  FOR r IN
    SELECT DISTINCT public.slot_lock_key(_to, a.date, a.time_slot::text, a.appointment_type::text) AS k
      FROM public.appointments a
     WHERE a.practitioner_id = _from AND a.doctor_id = v_clinic AND a.date >= v_from_date
       AND a.status::text IN ('pending', 'confirmed') AND a.time_slot IS NOT NULL
     ORDER BY 1
  LOOP
    PERFORM pg_advisory_xact_lock(r.k);
  END LOOP;

  FOR r IN
    SELECT id, date, serving_started_at FROM public.appointments
     WHERE practitioner_id = _from AND doctor_id = v_clinic AND date >= v_from_date
       AND status::text IN ('pending', 'confirmed')
     ORDER BY date, sort_time, id
  LOOP
    IF r.serving_started_at IS NOT NULL THEN
      v_skipped := v_skipped || r.id;
      v_reasons := v_reasons || jsonb_build_object('id', r.id, 'reason', 'PRACTITIONER_IN_SERVICE');
      CONTINUE;
    END IF;
    BEGIN
      -- A booked time already past today would fail the new doctor's slot check (SLOT_IN_PAST):
      -- drop it, as queue_action('transfer') does; the line order comes from sort_time.
      UPDATE public.appointments
         SET practitioner_id = _to,
             time_slot = CASE
               WHEN date = v_today AND time_slot IS NOT NULL
                    AND ((date::text || ' ' || time_slot)::timestamp AT TIME ZONE 'Asia/Kolkata') < now()
               THEN NULL ELSE time_slot END
       WHERE id = r.id;
      IF r.date = v_today THEN
        -- sort_time is recomputed by trg_set_appointment_sort_time only when time_slot is set;
        -- set it explicitly so today's moved patients join the END of the target's line.
        UPDATE public.appointments SET sort_time = (now() AT TIME ZONE 'Asia/Kolkata')::time WHERE id = r.id;
      END IF;
      v_moved := v_moved + 1;
    EXCEPTION WHEN check_violation THEN
      IF SQLERRM IN ('SLOT_FULL', 'SLOT_IN_PAST', 'PRACTITIONER_MISMATCH', 'PRACTITIONER_NOT_BOOKABLE',
                     'SEAT_LIMIT', 'PRACTITIONER_IN_SERVICE', 'APPOINTMENT_CLOSED') THEN
        v_skipped := v_skipped || r.id;
        v_reasons := v_reasons || jsonb_build_object('id', r.id, 'reason', SQLERRM);
      ELSE
        RAISE;
      END IF;
    END;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'moved', v_moved, 'skipped', to_jsonb(v_skipped),
                            'skipped_reasons', v_reasons);
END;
$$;

-- ---- 7. upsert_practitioner ----
-- Known refusals keep their own code instead of INVALID; a concurrent add of the same name retries
-- the slug; photo_url / signature_url must be empty or point into this doctor's own upload folder.
CREATE OR REPLACE FUNCTION public.upsert_practitioner(_id uuid, _data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_clinic uuid := public.practitioner_manager_clinic();
  p        public.practitioners%ROWTYPE;
  v_name   text := NULLIF(btrim(COALESCE(_data->>'display_name', '')), '');
  v_base   text;
  v_slug   text;
  v_n      integer := 1;
  v_owner_row boolean;
  v_photo  text := NULLIF(btrim(COALESCE(_data->>'photo_url', '')), '');
  v_sig    text := NULLIF(btrim(COALESCE(_data->>'signature_url', '')), '');
  v_prefix text;
  v_tries  integer := 0;
  v_con    text;
BEGIN
  IF v_clinic IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;
  IF _data IS NULL OR jsonb_typeof(_data) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID');
  END IF;

  -- Uploads happen after the doctor exists (the id is part of the path), so a new doctor cannot
  -- come with a photo or signature.
  IF v_photo IS NOT NULL OR v_sig IS NOT NULL THEN
    IF _id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'INVALID');
    END IF;
    v_prefix := '/doctor-uploads/' || v_clinic::text || '/practitioners/' || _id::text || '/';
    IF (v_photo IS NOT NULL AND strpos(v_photo, v_prefix) = 0)
       OR (v_sig IS NOT NULL AND strpos(v_sig, v_prefix) = 0) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'INVALID');
    END IF;
  END IF;

  IF _id IS NULL THEN
    IF NOT COALESCE(public.clinic_multi_doctor_enabled(v_clinic), false) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'MULTI_DOCTOR_NOT_ENABLED');
    END IF;
    IF v_name IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NAME_REQUIRED');
    END IF;
    v_base := COALESCE(NULLIF(public.directory_slugify(v_name), ''), 'doctor');
    LOOP
      v_slug := v_base;
      WHILE EXISTS (SELECT 1 FROM public.practitioners WHERE doctor_id = v_clinic AND slug = v_slug) LOOP
        v_n := v_n + 1;
        v_slug := v_base || '-' || v_n;
      END LOOP;
      BEGIN
        INSERT INTO public.practitioners (doctor_id, display_name, slug, sort_order)
        VALUES (v_clinic, v_name, v_slug,
                COALESCE((SELECT max(sort_order) + 1 FROM public.practitioners WHERE doctor_id = v_clinic), 0))
        RETURNING * INTO p;
        EXIT;
      EXCEPTION
        WHEN check_violation THEN
          IF SQLERRM = 'SEAT_LIMIT' THEN
            RETURN jsonb_build_object('ok', false, 'error', 'SEAT_LIMIT');
          END IF;
          RAISE;
        WHEN unique_violation THEN
          -- A concurrent add of the same name took the slug: look again (the row is visible now).
          GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
          v_tries := v_tries + 1;
          IF v_con IS DISTINCT FROM 'uq_practitioners_doctor_slug' OR v_tries > 10 THEN
            RETURN jsonb_build_object('ok', false, 'error', 'INVALID');
          END IF;
      END;
    END LOOP;
    -- New doctors start with the primary doctor's weekly hours (editable right after).
    INSERT INTO public.working_hours (doctor_id, practitioner_id, day_of_week, is_open, start_time, end_time, start_time_2, end_time_2)
    SELECT w.doctor_id, p.id, w.day_of_week, w.is_open, w.start_time, w.end_time, w.start_time_2, w.end_time_2
      FROM public.working_hours w
     WHERE w.doctor_id = v_clinic AND w.practitioner_id = public.primary_practitioner_id(v_clinic);
  ELSE
    SELECT * INTO p FROM public.practitioners WHERE id = _id AND doctor_id = v_clinic FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'PRACTITIONER_NOT_FOUND');
    END IF;
  END IF;

  v_owner_row := COALESCE(p.user_id = v_clinic, false);
  UPDATE public.practitioners SET
    display_name        = CASE WHEN v_owner_row OR NOT (_data ? 'display_name') OR v_name IS NULL THEN display_name ELSE v_name END,
    specialization      = CASE WHEN v_owner_row OR NOT (_data ? 'specialization') THEN specialization ELSE NULLIF(btrim(_data->>'specialization'), '') END,
    qualifications      = CASE WHEN v_owner_row OR NOT (_data ? 'qualifications') THEN qualifications ELSE NULLIF(btrim(_data->>'qualifications'), '') END,
    experience_years    = CASE WHEN v_owner_row OR NOT (_data ? 'experience_years') THEN experience_years ELSE NULLIF(_data->>'experience_years', '')::int END,
    bio                 = CASE WHEN v_owner_row OR NOT (_data ? 'bio') THEN bio ELSE NULLIF(btrim(_data->>'bio'), '') END,
    photo_url           = CASE WHEN v_owner_row OR NOT (_data ? 'photo_url') THEN photo_url ELSE NULLIF(_data->>'photo_url', '') END,
    registration_number = CASE WHEN v_owner_row OR NOT (_data ? 'registration_number') THEN registration_number ELSE NULLIF(btrim(_data->>'registration_number'), '') END,
    signature_url       = CASE WHEN v_owner_row OR NOT (_data ? 'signature_url') THEN signature_url ELSE NULLIF(_data->>'signature_url', '') END,
    consultation_fee    = CASE WHEN NOT (_data ? 'consultation_fee') THEN consultation_fee ELSE NULLIF(_data->>'consultation_fee', '')::numeric END,
    slot_duration_minutes = CASE WHEN NOT (_data ? 'slot_duration_minutes') THEN slot_duration_minutes ELSE NULLIF(_data->>'slot_duration_minutes', '')::int END,
    online_booking      = CASE WHEN NOT (_data ? 'online_booking') THEN online_booking ELSE (_data->>'online_booking')::boolean END,
    directory_listed    = CASE WHEN NOT (_data ? 'directory_listed') THEN directory_listed ELSE (_data->>'directory_listed')::boolean END,
    sort_order          = CASE WHEN NOT (_data ? 'sort_order') THEN sort_order ELSE (_data->>'sort_order')::int END
  WHERE id = p.id;

  RETURN jsonb_build_object('ok', true, 'id', p.id);
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range OR not_null_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID');
  WHEN check_violation THEN
    IF SQLERRM IN ('SEAT_LIMIT', 'PRIMARY_PRACTITIONER_REQUIRED', 'PRACTITIONER_MISMATCH', 'PRACTITIONER_NOT_BOOKABLE') THEN
      RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID');
END;
$$;

-- ---- 8. set_practitioner_status / set_primary_practitioner ----
-- Bringing a doctor back also brings their login back (owner only, like switching it off).
CREATE OR REPLACE FUNCTION public.set_practitioner_status(_id uuid, _is_active boolean, _is_bookable boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_clinic uuid := public.practitioner_manager_clinic();
  p public.practitioners%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_future integer;
  v_login uuid;
  v_reactivating boolean;
BEGIN
  IF v_clinic IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;
  IF _is_active IS NULL OR _is_bookable IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID');
  END IF;
  SELECT * INTO p FROM public.practitioners WHERE id = _id AND doctor_id = v_clinic FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PRACTITIONER_NOT_FOUND');
  END IF;
  IF p.is_primary AND NOT (_is_active AND _is_bookable) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PRIMARY_PRACTITIONER_REQUIRED');
  END IF;
  v_reactivating := _is_active AND NOT p.is_active;
  -- Deactivating or re-activating a doctor also switches their login, and doctor logins are the
  -- owner's call (trg_guard_doctor_role_staff): refuse up front instead of failing half-way.
  IF (NOT _is_active OR v_reactivating) AND auth.uid() IS DISTINCT FROM v_clinic
     AND EXISTS (SELECT 1 FROM public.staff_members s
                  WHERE s.doctor_id = v_clinic AND (s.id = p.user_id OR s.practitioner_id = p.id)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'OWNER_ONLY');
  END IF;
  IF NOT _is_active THEN
    SELECT count(*) INTO v_future FROM public.appointments
     WHERE practitioner_id = p.id AND date >= v_today AND status::text IN ('pending', 'confirmed');
    IF v_future > 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'HAS_FUTURE_APPOINTMENTS', 'count', v_future);
    END IF;
  END IF;

  BEGIN
    UPDATE public.practitioners SET is_active = _is_active, is_bookable = _is_active AND _is_bookable WHERE id = p.id;
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM = 'SEAT_LIMIT' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'SEAT_LIMIT');
    END IF;
    RAISE;
  END;

  -- A deactivated doctor can no longer sign in; a re-activated one can again.
  IF NOT _is_active OR v_reactivating THEN
    FOR v_login IN
      SELECT s.id FROM public.staff_members s
       WHERE s.doctor_id = v_clinic AND (s.id = p.user_id OR s.practitioner_id = p.id) AND s.id <> v_clinic
    LOOP
      IF _is_active THEN
        UPDATE public.staff_members SET status = 'active' WHERE id = v_login;
      ELSE
        UPDATE public.staff_members SET status = 'inactive' WHERE id = v_login;
        PERFORM public.revoke_user_sessions(v_login);
      END IF;
    END LOOP;
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_primary_practitioner(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'OWNER_ONLY');
  END IF;
  -- Two simultaneous changes of the primary must not interleave.
  PERFORM pg_advisory_xact_lock(hashtext('practitioner_primary:' || v_uid::text));
  IF NOT EXISTS (SELECT 1 FROM public.practitioners WHERE id = _id AND doctor_id = v_uid AND is_active AND is_bookable) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PRACTITIONER_NOT_BOOKABLE');
  END IF;
  UPDATE public.practitioners SET is_primary = false WHERE doctor_id = v_uid AND is_primary AND id <> _id;
  UPDATE public.practitioners SET is_primary = true WHERE id = _id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---- 9. prescriptions.created_by never changes after the insert ----
CREATE OR REPLACE FUNCTION public.keep_prescription_created_by()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.created_by := OLD.created_by;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.keep_prescription_created_by() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_a01_keep_created_by ON public.prescriptions;
CREATE TRIGGER trg_a01_keep_created_by
  BEFORE UPDATE OF created_by ON public.prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.keep_prescription_created_by();

-- ---- 10. get_queue_position counts only the appointment's own doctor ----
CREATE OR REPLACE FUNCTION public.get_queue_position(_appointment_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH me AS (
    SELECT id, doctor_id, practitioner_id, date, sort_time, created_at, priority
    FROM public.appointments WHERE id = _appointment_id
  )
  SELECT COUNT(*)::int FROM public.appointments a, me
  WHERE a.doctor_id = me.doctor_id
    AND a.practitioner_id = me.practitioner_id
    AND a.date = me.date
    AND a.appointment_type = 'clinic'
    AND a.status IN ('pending', 'confirmed')
    AND a.skipped_at IS NULL
    AND a.id <> me.id
    AND (a.priority > me.priority
         OR (a.priority = me.priority
             AND (a.sort_time < me.sort_time
                  OR (a.sort_time = me.sort_time
                      AND (a.created_at < me.created_at
                           OR (a.created_at = me.created_at AND a.id < me.id))))));
$$;

-- ---- 11. get_public_practitioners also says which row is the clinic owner ----
-- New column at the END, so callers that read columns by name are unaffected.
DROP FUNCTION IF EXISTS public.get_public_practitioners(uuid);
CREATE FUNCTION public.get_public_practitioners(_doctor_id uuid)
RETURNS TABLE(
  id uuid, display_name text, slug text, specialization text, qualifications text,
  experience_years integer, bio text, photo_url text, registration_number text,
  consultation_fee numeric, slot_duration_minutes integer, online_booking boolean,
  bookable boolean, is_primary boolean, sort_order integer, is_owner boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.display_name, p.slug, p.specialization, p.qualifications,
         p.experience_years, p.bio, p.photo_url, p.registration_number,
         p.consultation_fee, p.slot_duration_minutes, p.online_booking,
         COALESCE(p.online_booking AND public.practitioner_within_seats(p.id), false) AS bookable,
         p.is_primary, p.sort_order,
         (p.user_id IS NOT DISTINCT FROM p.doctor_id) AS is_owner
    FROM public.practitioners p
    JOIN public.profiles pr ON pr.id = p.doctor_id
   WHERE p.doctor_id = _doctor_id
     AND p.is_active
     AND pr.onboarding_completed = true
     AND pr.plan_status <> 'cancelled'
   ORDER BY p.is_primary DESC, p.sort_order, p.display_name
$$;
REVOKE ALL ON FUNCTION public.get_public_practitioners(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_practitioners(uuid) TO anon, authenticated, service_role;

-- ---- 12. Does this phone number belong to a clinic? (edge functions only) ----
CREATE OR REPLACE FUNCTION public.phone_owns_clinic(_digits text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  d text := regexp_replace(COALESCE(_digits, ''), '\D', '', 'g');
BEGIN
  IF length(d) < 10 THEN
    RETURN false;
  END IF;
  d := right(d, 10);
  RETURN COALESCE(EXISTS (
    SELECT 1 FROM public.profiles
     WHERE phone IS NOT NULL
       AND length(regexp_replace(phone, '\D', '', 'g')) >= 10
       AND right(regexp_replace(phone, '\D', '', 'g'), 10) = d), false);
END;
$$;
REVOKE ALL ON FUNCTION public.phone_owns_clinic(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.phone_owns_clinic(text) TO service_role;

NOTIFY pgrst, 'reload schema';
