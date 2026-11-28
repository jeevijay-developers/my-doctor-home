-- Multi-doctor public site, phase 5: the next free clinic-visit slot of every bookable doctor,
-- in ONE call (doctor cards and the booking doctor picker; never N calls).
-- Exposes ids and times only. The rules mirror what a patient can actually book:
--   * doctor: active + online_booking + within seats (get_public_practitioners' `bookable`),
--     clinic onboarded and not cancelled;
--   * hours: the doctor's own working_hours (both sessions), slot length = the doctor's own
--     else the clinic's else 30, a slot must fully fit before the session ends
--     (same as src/lib/timeSlots.ts generateTimeSlots);
--   * days: today (IST) forward, at most the clinic's booking_advance_days (default 7), hard cap 14;
--   * a slot is taken once it has one non-cancelled 'clinic' booking for THAT doctor
--     (same rule as enforce_slot_capacity / get_slot_counts); past slots (IST now) are skipped.
-- Hard caps: 14 days, 20 doctors (primary first, then sort_order).
CREATE OR REPLACE FUNCTION public.get_public_next_available(_doctor_id uuid, _days integer DEFAULT 14)
RETURNS TABLE(practitioner_id uuid, next_date date, next_time time)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH clinic AS (
    SELECT pr.id,
           (now() AT TIME ZONE 'Asia/Kolkata')::date AS today,
           LEAST(GREATEST(COALESCE(_days, 14), 1), 14, GREATEST(COALESCE(ws.booking_advance_days, 7), 1)) AS horizon,
           COALESCE(ws.slot_duration_minutes, 30) AS clinic_step
      FROM public.profiles pr
      LEFT JOIN public.website_settings ws ON ws.doctor_id = pr.id
     WHERE pr.id = _doctor_id
       AND pr.onboarding_completed = true
       AND pr.plan_status <> 'cancelled'
  ),
  docs AS (
    SELECT p.id, COALESCE(p.slot_duration_minutes, c.clinic_step) AS step, c.today, c.horizon, c.id AS clinic_id
      FROM clinic c
      JOIN public.practitioners p ON p.doctor_id = c.id
     WHERE p.is_active
       AND COALESCE(p.online_booking AND public.practitioner_within_seats(p.id), false)
     ORDER BY p.is_primary DESC, p.sort_order, p.created_at, p.id
     LIMIT 20
  ),
  seg AS (
    SELECT d.id AS pid, d.step, d.clinic_id, (d.today + g.i) AS day, s.st, s.en
      FROM docs d
      CROSS JOIN LATERAL generate_series(0, d.horizon - 1) AS g(i)
      JOIN public.working_hours wh
        ON wh.practitioner_id = d.id AND wh.is_open
       AND wh.day_of_week = EXTRACT(DOW FROM (d.today + g.i))::int
      CROSS JOIN LATERAL (VALUES (wh.start_time, wh.end_time), (wh.start_time_2, wh.end_time_2)) AS s(st, en)
     WHERE s.st IS NOT NULL AND s.en IS NOT NULL
  ),
  slots AS (
    SELECT sg.pid, sg.clinic_id, sg.day, make_time(m.mm / 60, m.mm % 60, 0) AS t
      FROM seg sg
      CROSS JOIN LATERAL generate_series(
        (EXTRACT(HOUR FROM sg.st) * 60 + EXTRACT(MINUTE FROM sg.st))::int,
        (EXTRACT(HOUR FROM sg.en) * 60 + EXTRACT(MINUTE FROM sg.en))::int - sg.step,
        sg.step) AS m(mm)
  ),
  free AS (
    SELECT s.pid, s.day, s.t
      FROM slots s
     WHERE ((s.day::text || ' ' || s.t::text)::timestamp AT TIME ZONE 'Asia/Kolkata') > now()
       AND NOT EXISTS (
         SELECT 1 FROM public.appointments a
          WHERE a.doctor_id = s.clinic_id AND a.practitioner_id = s.pid
            AND a.date = s.day AND a.time_slot = s.t
            AND a.appointment_type = 'clinic' AND a.status <> 'cancelled')
  )
  SELECT d.id AS practitioner_id, f.day AS next_date, f.t AS next_time
    FROM docs d
    LEFT JOIN LATERAL (
      SELECT fr.day, fr.t FROM free fr WHERE fr.pid = d.id ORDER BY fr.day, fr.t LIMIT 1
    ) f ON true
$$;
REVOKE ALL ON FUNCTION public.get_public_next_available(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_next_available(uuid, integer) TO anon, authenticated, service_role;
