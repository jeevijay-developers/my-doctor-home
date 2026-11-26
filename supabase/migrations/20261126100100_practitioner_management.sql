-- Multi-doctor P1 part 2: managing doctors, doctor logins, per-doctor working hours.

-- ---- Doctor logins: a staff_members row with role 'doctor' linked to one practitioner ----
ALTER TABLE public.staff_members ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'staff'
  CHECK (role IN ('staff', 'doctor'));
ALTER TABLE public.staff_members ADD COLUMN IF NOT EXISTS practitioner_id uuid UNIQUE;
ALTER TABLE public.staff_members ADD CONSTRAINT staff_members_practitioner_fk
  FOREIGN KEY (practitioner_id, doctor_id) REFERENCES public.practitioners (id, doctor_id);
ALTER TABLE public.staff_members ADD CONSTRAINT staff_members_doctor_role_needs_practitioner
  CHECK (role <> 'doctor' OR practitioner_id IS NOT NULL);

-- Only the clinic owner manages doctor logins (closes the "staff.edit can grant more than they
-- hold" gap for doctor accounts). Edge functions (service role, no JWT) are trusted: they check
-- the owner themselves. Fires before trg_guard_staff_member_delegation (alphabetical order).
CREATE OR REPLACE FUNCTION public.guard_doctor_role_staff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_clinic uuid := COALESCE(NEW.doctor_id, OLD.doctor_id);
BEGIN
  IF v_uid IS NULL OR v_uid = v_clinic THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF (TG_OP <> 'DELETE' AND (NEW.role = 'doctor' OR NEW.practitioner_id IS NOT NULL))
     OR (TG_OP <> 'INSERT' AND (OLD.role = 'doctor' OR OLD.practitioner_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'OWNER_ONLY' USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_doctor_role_staff ON public.staff_members;
CREATE TRIGGER trg_guard_doctor_role_staff
  BEFORE INSERT OR UPDATE OR DELETE ON public.staff_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_doctor_role_staff();

-- ---- Per-doctor working hours: contract step of P0's expand/contract ----
-- uq_working_hours_practitioner_day (practitioner_id, day_of_week) stays the uniqueness rule.
ALTER TABLE public.working_hours DROP CONSTRAINT IF EXISTS working_hours_doctor_id_day_of_week_key;

-- ---- Realtime for the Doctors page and pickers ----
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'practitioners') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.practitioners;
  END IF;
END $$;

-- ---- Who may manage doctors ----
-- NULL for anyone else (a CASE with no match): callers refuse on NULL.
CREATE OR REPLACE FUNCTION public.practitioner_manager_clinic()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()) THEN auth.uid()
    WHEN COALESCE(public.staff_has_permission(auth.uid(), 'practitioners.manage'), false) THEN public.staff_doctor_id(auth.uid())
  END
$$;
REVOKE ALL ON FUNCTION public.practitioner_manager_clinic() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.my_practitioner_id(_doctor_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id FROM public.practitioners
   WHERE doctor_id = _doctor_id AND user_id = auth.uid() AND is_active
$$;
REVOKE ALL ON FUNCTION public.my_practitioner_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_practitioner_id(uuid) TO authenticated;

-- ---- Create / edit a doctor ----
-- _data keys (all optional on edit): display_name, specialization, qualifications,
-- experience_years, bio, photo_url, registration_number, signature_url (personal fields; not
-- editable on the owner's own row, which syncs from Profile), consultation_fee,
-- slot_duration_minutes, online_booking, directory_listed, sort_order. Unknown keys are ignored.
-- The slug is set once at creation and never changes. A new doctor needs a free seat (A1 trigger).
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
BEGIN
  IF v_clinic IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;
  IF _data IS NULL OR jsonb_typeof(_data) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID');
  END IF;

  IF _id IS NULL THEN
    IF NOT COALESCE(public.clinic_multi_doctor_enabled(v_clinic), false) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'MULTI_DOCTOR_NOT_ENABLED');
    END IF;
    IF v_name IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'NAME_REQUIRED');
    END IF;
    v_base := COALESCE(NULLIF(public.directory_slugify(v_name), ''), 'doctor');
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
    EXCEPTION WHEN check_violation THEN
      IF SQLERRM = 'SEAT_LIMIT' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'SEAT_LIMIT');
      END IF;
      RAISE;
    END;
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
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID');
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_practitioner(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_practitioner(uuid, jsonb) TO authenticated;

-- ---- Activate / deactivate / stop bookings ----
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
  -- Deactivating a doctor also disables their login, and doctor logins are the owner's call
  -- (trg_guard_doctor_role_staff): refuse up front instead of failing half-way.
  IF NOT _is_active AND auth.uid() IS DISTINCT FROM v_clinic
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

  -- A deactivated doctor can no longer sign in.
  IF NOT _is_active THEN
    FOR v_login IN
      SELECT s.id FROM public.staff_members s
       WHERE s.doctor_id = v_clinic AND (s.id = p.user_id OR s.practitioner_id = p.id) AND s.id <> v_clinic
    LOOP
      UPDATE public.staff_members SET status = 'inactive' WHERE id = v_login;
      PERFORM public.revoke_user_sessions(v_login);
    END LOOP;
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.set_practitioner_status(uuid, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_practitioner_status(uuid, boolean, boolean) TO authenticated;

-- ---- Change the primary doctor (owner only) ----
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
  IF NOT EXISTS (SELECT 1 FROM public.practitioners WHERE id = _id AND doctor_id = v_uid AND is_active AND is_bookable) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PRACTITIONER_NOT_BOOKABLE');
  END IF;
  UPDATE public.practitioners SET is_primary = false WHERE doctor_id = v_uid AND is_primary AND id <> _id;
  UPDATE public.practitioners SET is_primary = true WHERE id = _id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.set_primary_practitioner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_primary_practitioner(uuid) TO authenticated;

-- ---- Move a doctor's open bookings to another doctor ----
-- Each booking moves on its own; one that clashes with the target's existing booking is left
-- with the original doctor and reported in "skipped". Patients in the room are never moved.
-- Today's waiting patients join the end of the target's line (queue_action-style move).
CREATE OR REPLACE FUNCTION public.reassign_practitioner_appointments(_from uuid, _to uuid, _from_date date DEFAULT NULL)
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

  FOR r IN
    SELECT id, date, serving_started_at FROM public.appointments
     WHERE practitioner_id = _from AND doctor_id = v_clinic AND date >= v_from_date
       AND status::text IN ('pending', 'confirmed')
     ORDER BY date, sort_time, id
  LOOP
    IF r.serving_started_at IS NOT NULL THEN
      v_skipped := v_skipped || r.id;
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
      v_skipped := v_skipped || r.id;
    END;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'moved', v_moved, 'skipped', to_jsonb(v_skipped));
END;
$$;
REVOKE ALL ON FUNCTION public.reassign_practitioner_appointments(uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reassign_practitioner_appointments(uuid, uuid, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
