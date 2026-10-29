-- Live queue: staff actions (one RPC), an audit trail, and two public read-only
-- functions that expose queue NUMBERS only (no names, phones or complaints).
--
-- Queue model
--   * a patient is "waiting" when status is pending/confirmed, appointment_type is
--     'clinic', skipped_at is NULL and serving_started_at is NULL;
--   * order: priority first (emergency/elderly...), then sort_time, then created_at;
--   * "serving" = serving_started_at is set and the status is still pending/confirmed
--     (at most one per doctor per day, enforced by uq_appointments_one_serving);
--   * "skipped" patients leave the line but stay visible and can be recalled to their
--     original place.

-- ---------------------------------------------------------------------------
-- Audit trail of everything that changes the line (append-only for clients).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.queue_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  appointment_id uuid,
  actor_id       uuid,
  action         text NOT NULL,
  reason         text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_queue_events_doctor_created ON public.queue_events (doctor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_queue_events_appointment ON public.queue_events (appointment_id);

ALTER TABLE public.queue_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.queue_events FROM anon, authenticated;
GRANT SELECT ON public.queue_events TO authenticated;

DROP POLICY IF EXISTS "Doctors view own queue events" ON public.queue_events;
CREATE POLICY "Doctors view own queue events" ON public.queue_events
  FOR SELECT TO authenticated USING (auth.uid() = doctor_id);

DROP POLICY IF EXISTS "Staff view queue events" ON public.queue_events;
CREATE POLICY "Staff view queue events" ON public.queue_events
  FOR SELECT TO authenticated
  USING (public.staff_doctor_id(auth.uid()) = doctor_id AND public.staff_has_permission(auth.uid(), 'appointments.view'));

-- ---------------------------------------------------------------------------
-- Staff/doctor actions. SECURITY DEFINER, but every path re-checks who the caller is
-- and that the appointment belongs to their clinic.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.queue_action(
  _action text,
  _appointment_id uuid DEFAULT NULL,
  _reason text DEFAULT NULL,
  _payment_method text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_doctor uuid;
  v_today  date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  a        public.appointments%ROWTYPE;
  cur      public.appointments%ROWTYPE;
  nxt      public.appointments%ROWTYPE;
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
                     'set_priority', 'clear_priority', 'mark_paid') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'UNKNOWN_ACTION');
  END IF;

  -- One writer at a time per doctor per day: two staff tapping "next" cannot both win.
  PERFORM pg_advisory_xact_lock(hashtext('queue:' || v_doctor::text || v_today::text));

  -- ---- call_next: finish whoever is being seen, then call the next waiting patient ----
  IF _action = 'call_next' THEN
    SELECT * INTO cur FROM public.appointments
     WHERE doctor_id = v_doctor AND date = v_today AND serving_started_at IS NOT NULL
       AND status IN ('pending', 'confirmed')
     FOR UPDATE;
    IF FOUND THEN
      UPDATE public.appointments SET status = 'completed' WHERE id = cur.id;
      INSERT INTO public.queue_events (doctor_id, appointment_id, actor_id, action) VALUES (v_doctor, cur.id, v_uid, 'complete');
    END IF;

    SELECT * INTO nxt FROM public.appointments
     WHERE doctor_id = v_doctor AND date = v_today AND appointment_type = 'clinic'
       AND status IN ('pending', 'confirmed') AND skipped_at IS NULL AND serving_started_at IS NULL
     ORDER BY priority DESC, sort_time, created_at
     LIMIT 1
     FOR UPDATE SKIP LOCKED;
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

  IF _action = 'call' THEN
    IF a.status NOT IN ('pending', 'confirmed') OR a.date <> v_today THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NOT_CALLABLE');
    END IF;
    IF a.serving_started_at IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'serving', a.id);
    END IF;
    SELECT * INTO cur FROM public.appointments
     WHERE doctor_id = v_doctor AND date = v_today AND serving_started_at IS NOT NULL
       AND status IN ('pending', 'confirmed') AND id <> a.id
     FOR UPDATE;
    IF FOUND THEN
      UPDATE public.appointments SET status = 'completed' WHERE id = cur.id;
      INSERT INTO public.queue_events (doctor_id, appointment_id, actor_id, action) VALUES (v_doctor, cur.id, v_uid, 'complete');
    END IF;
    UPDATE public.appointments SET serving_started_at = now(), skipped_at = NULL WHERE id = a.id;
    INSERT INTO public.queue_events (doctor_id, appointment_id, actor_id, action, reason) VALUES (v_doctor, a.id, v_uid, 'call', v_reason);
    RETURN jsonb_build_object('ok', true, 'serving', a.id, 'completed', cur.id);

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
    -- Jumping the line must be explained, because patients watch their position.
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

REVOKE EXECUTE ON FUNCTION public.queue_action(text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_action(text, uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Public, read-only. Numbers only: nothing here identifies a patient.
-- ---------------------------------------------------------------------------

-- "Now serving" board for the waiting room screen and the booking confirmation.
CREATE OR REPLACE FUNCTION public.get_public_queue(_doctor_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH t AS (SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date AS today),
  appts AS (
    SELECT a.* FROM public.appointments a, t
     WHERE a.doctor_id = _doctor_id AND a.date = t.today AND a.appointment_type = 'clinic'
       AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _doctor_id AND p.onboarding_completed = true)
  ),
  waiting AS (
    SELECT queue_number,
           row_number() OVER (ORDER BY priority DESC, sort_time, created_at) AS rn
      FROM appts
     WHERE status IN ('pending', 'confirmed') AND skipped_at IS NULL AND serving_started_at IS NULL
  ),
  recent AS (
    SELECT EXTRACT(EPOCH FROM (completed_at - serving_started_at)) / 60.0 AS minutes
      FROM appts
     WHERE status = 'completed' AND serving_started_at IS NOT NULL AND completed_at IS NOT NULL
       AND completed_at > serving_started_at
     ORDER BY completed_at DESC LIMIT 10
  )
  SELECT jsonb_build_object(
    'now_serving', (SELECT queue_number FROM appts
                     WHERE serving_started_at IS NOT NULL AND status IN ('pending', 'confirmed') LIMIT 1),
    'next_up',     COALESCE((SELECT jsonb_agg(queue_number ORDER BY rn) FROM waiting WHERE rn <= 5), '[]'::jsonb),
    'waiting',     (SELECT count(*) FROM waiting),
    'done',        (SELECT count(*) FROM appts WHERE status = 'completed'),
    'avg_minutes', (SELECT round(avg(minutes)::numeric, 1) FROM recent),
    'updated_at',  now()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_queue(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_queue(uuid) TO anon, authenticated;

-- A patient's own place in line. Needs the booking token AND a real phone number,
-- and only answers for today's visit.
CREATE OR REPLACE FUNCTION public.get_my_queue_status(_doctor_id uuid, _token text, _phone text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  me public.appointments%ROWTYPE;
  ahead integer;
  serving integer;
  avg_min numeric;
BEGIN
  IF length(btrim(COALESCE(_phone, ''))) < 10 OR COALESCE(_token, '') = '' THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT * INTO me FROM public.appointments
   WHERE doctor_id = _doctor_id AND token_number = _token AND patient_phone = _phone
     AND date = today AND appointment_type = 'clinic'
   ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT queue_number INTO serving FROM public.appointments
   WHERE doctor_id = _doctor_id AND date = today AND serving_started_at IS NOT NULL
     AND status IN ('pending', 'confirmed') LIMIT 1;

  SELECT round(avg(EXTRACT(EPOCH FROM (completed_at - serving_started_at)) / 60.0)::numeric, 1) INTO avg_min
    FROM (SELECT completed_at, serving_started_at FROM public.appointments
           WHERE doctor_id = _doctor_id AND date = today AND status = 'completed'
             AND serving_started_at IS NOT NULL AND completed_at > serving_started_at
           ORDER BY completed_at DESC LIMIT 10) r;

  IF me.status::text IN ('pending', 'confirmed') AND me.skipped_at IS NULL AND me.serving_started_at IS NULL THEN
    SELECT count(*)::int INTO ahead FROM public.appointments a
     WHERE a.doctor_id = _doctor_id AND a.date = today AND a.appointment_type = 'clinic'
       AND a.status IN ('pending', 'confirmed') AND a.skipped_at IS NULL AND a.serving_started_at IS NULL
       AND a.id <> me.id
       AND (a.priority > me.priority
            OR (a.priority = me.priority
                AND (a.sort_time < me.sort_time OR (a.sort_time = me.sort_time AND a.created_at < me.created_at))));
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'queue_number', me.queue_number,
    'state', CASE
      WHEN me.status::text = 'completed' THEN 'done'
      WHEN me.status::text IN ('cancelled', 'no_show') THEN me.status::text
      WHEN me.serving_started_at IS NOT NULL THEN 'serving'
      WHEN me.skipped_at IS NOT NULL THEN 'skipped'
      ELSE 'waiting' END,
    'ahead', ahead,
    'now_serving', serving,
    'avg_minutes', avg_min
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_queue_status(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_queue_status(uuid, text, text) TO anon, authenticated;

-- The older "how many are ahead" helper now follows the same ordering (priority, and
-- skipped patients are no longer counted ahead of anyone). Online visits have no
-- physical line and are left out.
CREATE OR REPLACE FUNCTION public.get_queue_position(_appointment_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH me AS (
    SELECT doctor_id, date, sort_time, created_at, priority
    FROM public.appointments WHERE id = _appointment_id
  )
  SELECT COUNT(*)::int FROM public.appointments a, me
  WHERE a.doctor_id = me.doctor_id
    AND a.date = me.date
    AND a.appointment_type = 'clinic'
    AND a.status IN ('pending', 'confirmed')
    AND a.skipped_at IS NULL
    AND a.id <> _appointment_id
    AND (a.priority > me.priority
         OR (a.priority = me.priority
             AND (a.sort_time < me.sort_time
                  OR (a.sort_time = me.sort_time AND a.created_at < me.created_at))));
$$;

NOTIFY pgrst, 'reload schema';
