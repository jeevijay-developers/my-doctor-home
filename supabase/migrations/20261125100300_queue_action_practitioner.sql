-- Multi-doctor clinics, P0 part 4: the live-queue engine works per doctor.
-- The 6-argument queue_action gains _practitioner_id (7th, default NULL). Old and new
-- signatures cannot coexist (PostgREST overload ambiguity), so both functions are
-- dropped and recreated. Callers using named arguments are unaffected.
-- Body of queue_action_core is the 20261029140000 version; changes are marked "MD:".

DROP FUNCTION IF EXISTS public.queue_action(text, uuid, text, text, text, text);
DROP FUNCTION IF EXISTS public.queue_action_core(text, uuid, text, text, text);

CREATE FUNCTION public.queue_action_core(
  _action text,
  _appointment_id uuid,
  _reason text,
  _payment_method text,
  _expect text,
  _practitioner_id uuid
)
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
    IF NOT (v_target.is_active AND v_target.is_bookable) THEN
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
REVOKE ALL ON FUNCTION public.queue_action_core(text, uuid, text, text, text, uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.queue_action(
  _action text,
  _appointment_id uuid DEFAULT NULL,
  _reason text DEFAULT NULL,
  _payment_method text DEFAULT NULL,
  _expect text DEFAULT NULL,
  _payment_reference text DEFAULT NULL,
  _practitioner_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ref text := upper(regexp_replace(COALESCE(_payment_reference, ''), '\s+', '', 'g'));
BEGIN
  IF _action = 'mark_paid' THEN
    IF _payment_method IN ('upi', 'card') THEN
      IF v_ref = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'PAYMENT_REFERENCE_REQUIRED');
      END IF;
      IF (_payment_method = 'upi'  AND v_ref !~ '^[0-9]{12}$')
      OR (_payment_method = 'card' AND v_ref !~ '^[A-Z0-9]{4,12}$') THEN
        RETURN jsonb_build_object('ok', false, 'error', 'PAYMENT_REFERENCE_INVALID');
      END IF;
      PERFORM set_config('app.payment_reference', v_ref, true);
    ELSE
      PERFORM set_config('app.payment_reference', '', true);
    END IF;
  END IF;

  RETURN public.queue_action_core(_action, _appointment_id, _reason, _payment_method, _expect, _practitioner_id);
EXCEPTION
  WHEN unique_violation THEN
    IF SQLERRM LIKE '%appointments_upi_reference_unique%' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'DUPLICATE_PAYMENT_REFERENCE');
    END IF;
    RAISE;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.queue_action(text, uuid, text, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_action(text, uuid, text, text, text, text, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
