-- Restore the per-type get_slot_counts that the booking widget calls.
--
-- 20260824120000_clinic_slot_capacity replaced the two-argument
-- get_slot_counts(_doctor_id, _date) with a three-argument version that filters by
-- appointment type, and every client (useSlotAvailability) calls the three-argument
-- form. The live database nevertheless ended up with only the two-argument function
-- (recreated outside the migration history), so the public booking widget's call
-- failed with PGRST202 and every slot looked free until the insert-time trigger
-- rejected it (SLOT_FULL).
--
-- This migration touches ONLY get_slot_counts. It deliberately does not re-run
-- 20260824120000: that file also replaces enforce_slot_capacity,
-- enforce_slot_capacity_update and reschedule_appointment_by_token with their
-- August versions, which later migrations (20260901120000, 20261029*) superseded.
--
-- The two-argument overload is dropped: with both present, a two-argument call is
-- ambiguous for PostgREST because the third parameter has a default.

DROP FUNCTION IF EXISTS public.get_slot_counts(uuid, date);

CREATE OR REPLACE FUNCTION public.get_slot_counts(
  _doctor_id uuid,
  _date date,
  _appointment_type text DEFAULT 'clinic'
)
RETURNS TABLE(time_slot text, booked integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT time_slot, COUNT(*)::int AS booked
  FROM public.appointments
  WHERE doctor_id = _doctor_id
    AND date = _date
    AND time_slot IS NOT NULL
    AND appointment_type = _appointment_type
    AND status <> 'cancelled'
  GROUP BY time_slot;
$$;

REVOKE ALL ON FUNCTION public.get_slot_counts(uuid, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_slot_counts(uuid, date, text) TO anon, authenticated, service_role;
