-- Multi-doctor P2 part 1: what the public booking site needs.
-- 1. get_public_practitioners: a clinic's active doctors with safe columns only (practitioners
--    itself is not readable by anonymous visitors). "bookable" = takes online bookings AND is
--    within the clinic's doctor seats, so a downgraded clinic shows only its primary as bookable.
-- 2. get_appointment_by_token also returns the appointment's doctor (manage-appointment page).
-- Check: npx supabase db query --linked -f supabase/tests/multi-doctor/09_public.sql

CREATE OR REPLACE FUNCTION public.get_public_practitioners(_doctor_id uuid)
RETURNS TABLE(
  id uuid, display_name text, slug text, specialization text, qualifications text,
  experience_years integer, bio text, photo_url text, registration_number text,
  consultation_fee numeric, slot_duration_minutes integer, online_booking boolean,
  bookable boolean, is_primary boolean, sort_order integer
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
         p.is_primary, p.sort_order
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

-- Body is the 20261124110000 version (live definition verified identical) plus two columns at
-- the END of the result, so callers that read columns by name are unaffected.
DROP FUNCTION IF EXISTS public.get_appointment_by_token(uuid, text, text);

CREATE FUNCTION public.get_appointment_by_token(_doctor_id uuid, _token text, _phone text)
 RETURNS TABLE(
   id uuid, doctor_id uuid, patient_name text, patient_phone text, service_name text,
   appointment_type text, date date, time_slot text, status text, token_number text,
   amount numeric, reschedule_count integer, chief_complaint text, meeting_link text,
   created_at timestamp with time zone,
   payment_status text, payment_method text, payment_gateway text,
   gateway_payment_id text, gateway_order_id text, paid_at timestamp with time zone,
   practitioner_id uuid, practitioner_name text
 )
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
           a.amount::numeric, a.reschedule_count, a.chief_complaint, a.meeting_link, a.created_at,
           a.payment_status::text, a.payment_method, a.payment_gateway,
           a.gateway_payment_id, a.gateway_order_id, a.paid_at,
           a.practitioner_id,
           (SELECT pr.display_name FROM public.practitioners pr WHERE pr.id = a.practitioner_id)
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

REVOKE ALL ON FUNCTION public.get_appointment_by_token(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_appointment_by_token(uuid, text, text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
