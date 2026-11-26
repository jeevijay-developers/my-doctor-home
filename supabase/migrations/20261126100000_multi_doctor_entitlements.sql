-- Multi-doctor P1 part 1: launch gate, doctor seats and the "within seats" rule.
-- With multi_doctor_enabled = false and no override, every clinic keeps exactly 1 seat,
-- so applying this changes nothing for anyone.

INSERT INTO public.features (key, label, description, default_min_tier, sort_order, is_active, is_requestable)
VALUES ('multi_doctor', 'Multiple doctors',
        'Add more doctors to your clinic, each with their own timings, queue and prescriptions.',
        'premium', 900, true, false)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.platform_settings (key, value) VALUES
  ('multi_doctor_enabled', 'false'::jsonb),
  ('doctor_seat_max', '15'::jsonb),
  ('doctor_seat_price', 'null'::jsonb),
  ('trial_extra_doctor_seats', '1'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Extra doctor seats bought by a clinic. A table of its own (not profiles) so the clinic can
-- read but never write it; superadmin sets it through set_clinic_doctor_seats().
CREATE TABLE IF NOT EXISTS public.clinic_doctor_seats (
  doctor_id   uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  extra_seats integer NOT NULL DEFAULT 0 CHECK (extra_seats >= 0),
  reason      text,
  set_by      uuid,
  set_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.clinic_doctor_seats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Clinic members can view their doctor seats" ON public.clinic_doctor_seats;
CREATE POLICY "Clinic members can view their doctor seats" ON public.clinic_doctor_seats
  FOR SELECT TO authenticated
  USING (auth.uid() = doctor_id OR public.staff_doctor_id(auth.uid()) = doctor_id OR public.has_role(auth.uid(), 'admin'));

-- On for a clinic when it has the feature (Premium/trial, or an override) AND either the
-- platform launch flag is on or a superadmin enabled it for this clinic (pilot).
CREATE OR REPLACE FUNCTION public.clinic_multi_doctor_enabled(_doctor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.doctor_has_feature(_doctor_id, 'multi_doctor')
     AND (
       EXISTS (SELECT 1 FROM public.platform_settings WHERE key = 'multi_doctor_enabled' AND value = 'true'::jsonb)
       OR EXISTS (SELECT 1 FROM public.doctor_feature_overrides o
                   WHERE o.doctor_id = _doctor_id AND o.feature_key = 'multi_doctor' AND o.enabled
                     AND (o.expires_at IS NULL OR o.expires_at > now()))
     )
$$;
REVOKE ALL ON FUNCTION public.clinic_multi_doctor_enabled(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clinic_multi_doctor_enabled(uuid) TO authenticated, service_role;

-- How many doctors may take bookings at once.
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
  IF EXISTS (SELECT 1 FROM public.profiles
              WHERE id = _doctor_id AND plan_status = 'trial' AND (trial_end IS NULL OR trial_end > now())) THEN
    v_limit := v_limit + public.platform_int_setting('trial_extra_doctor_seats', 1);
  END IF;
  RETURN LEAST(v_limit, public.platform_int_setting('doctor_seat_max', 15));
END;
$$;
REVOKE ALL ON FUNCTION public.clinic_doctor_seat_limit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clinic_doctor_seat_limit(uuid) TO authenticated, service_role;

-- Seat order: the primary first, then sort_order, created_at, id. A doctor ranked at or past
-- the limit (after a downgrade) keeps every existing booking but takes no new ones.
CREATE OR REPLACE FUNCTION public.practitioner_seat_rank(_practitioner_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT count(*)::int
    FROM public.practitioners x
    JOIN public.practitioners p ON p.id = _practitioner_id
   WHERE x.doctor_id = p.doctor_id AND x.is_active AND x.is_bookable AND x.id <> p.id
     AND (x.is_primary > p.is_primary
          OR (x.is_primary = p.is_primary AND (x.sort_order, x.created_at, x.id) < (p.sort_order, p.created_at, p.id)))
$$;
REVOKE ALL ON FUNCTION public.practitioner_seat_rank(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.practitioner_within_seats(_practitioner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.is_active AND p.is_bookable
         AND public.practitioner_seat_rank(p.id) < public.clinic_doctor_seat_limit(p.doctor_id)
    FROM public.practitioners p WHERE p.id = _practitioner_id
$$;
REVOKE ALL ON FUNCTION public.practitioner_within_seats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.practitioner_within_seats(uuid) TO authenticated, service_role;

-- Adding a doctor, or making one bookable again, needs a free seat.
CREATE OR REPLACE FUNCTION public.enforce_practitioner_seats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  used integer;
BEGIN
  IF NOT (NEW.is_active AND NEW.is_bookable) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_active AND OLD.is_bookable THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('practitioner_seats:' || NEW.doctor_id::text));
  SELECT count(*) INTO used FROM public.practitioners
   WHERE doctor_id = NEW.doctor_id AND is_active AND is_bookable AND id <> NEW.id;
  IF used + 1 > public.clinic_doctor_seat_limit(NEW.doctor_id) THEN
    RAISE EXCEPTION 'SEAT_LIMIT' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_practitioners_seats ON public.practitioners;
CREATE TRIGGER trg_practitioners_seats
  BEFORE INSERT OR UPDATE OF is_active, is_bookable ON public.practitioners
  FOR EACH ROW EXECUTE FUNCTION public.enforce_practitioner_seats();

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
    'seat_price',  (SELECT value FROM public.platform_settings WHERE key = 'doctor_seat_price')
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_clinic_doctor_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_clinic_doctor_access(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_clinic_doctor_seats(_doctor_id uuid, _extra integer, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_reason text := NULLIF(btrim(COALESCE(_reason, '')), '');
BEGIN
  IF v_uid IS NULL
     OR NOT COALESCE(public.has_role(v_uid, 'admin') OR public.sa_has_permission(v_uid, 'plan_requests.manage'), false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;
  IF v_uid = _doctor_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;
  IF _extra IS NULL OR _extra < 0 OR _extra > public.platform_int_setting('doctor_seat_max', 15) - 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID');
  END IF;
  IF v_reason IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'REASON_REQUIRED');
  END IF;
  INSERT INTO public.clinic_doctor_seats (doctor_id, extra_seats, reason, set_by, set_at)
  VALUES (_doctor_id, _extra, v_reason, v_uid, now())
  ON CONFLICT (doctor_id) DO UPDATE
    SET extra_seats = EXCLUDED.extra_seats, reason = EXCLUDED.reason, set_by = EXCLUDED.set_by, set_at = now();
  INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, details)
  VALUES (v_uid, 'set_doctor_seats', 'clinic_doctor_seats', _doctor_id,
          jsonb_build_object('extra_seats', _extra, 'reason', v_reason));
  RETURN jsonb_build_object('ok', true, 'seat_limit', public.clinic_doctor_seat_limit(_doctor_id));
END;
$$;
REVOKE ALL ON FUNCTION public.set_clinic_doctor_seats(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_clinic_doctor_seats(uuid, integer, text) TO authenticated;

-- Booking auto-fill picks only among doctors within the clinic's seats, and booking a doctor
-- outside the seats is refused (SEAT_LIMIT). Otherwise identical to
-- 20261125100100_practitioner_columns.sql.
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
BEGIN
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
    SELECT * INTO p FROM public.practitioners WHERE id = NEW.practitioner_id AND doctor_id = NEW.doctor_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRACTITIONER_MISMATCH' USING ERRCODE = 'check_violation';
    END IF;
    IF v_mode = 'booking'
       AND (NOT (p.is_active AND p.is_bookable)
            OR (COALESCE(auth.role(), '') = 'anon' AND NOT p.online_booking)) THEN
      RAISE EXCEPTION 'PRACTITIONER_NOT_BOOKABLE' USING ERRCODE = 'check_violation';
    END IF;
    IF v_mode = 'booking' AND NOT public.practitioner_within_seats(p.id) THEN
      RAISE EXCEPTION 'SEAT_LIMIT' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
