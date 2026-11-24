-- "My appointment" page (/dr/:slug/manage): the patient can download their payment receipt,
-- so the token + phone lookup also returns how the visit was paid.
--
-- Same rules as before (20261102100000_db_security_fixes.sql): phone must be real, lookups are
-- throttled per clinic + phone (token_lookup_*), and only the caller's own appointment is
-- returned. The new columns describe that appointment's own payment; nothing about other
-- patients or the clinic's account is exposed.
--
-- The return type changes, so the function is dropped and created again (CREATE OR REPLACE
-- cannot change OUT columns). Old clients keep working: they ignore the extra columns.

DROP FUNCTION IF EXISTS public.get_appointment_by_token(uuid, text, text);

CREATE FUNCTION public.get_appointment_by_token(_doctor_id uuid, _token text, _phone text)
 RETURNS TABLE(
   id uuid, doctor_id uuid, patient_name text, patient_phone text, service_name text,
   appointment_type text, date date, time_slot text, status text, token_number text,
   amount numeric, reschedule_count integer, chief_complaint text, meeting_link text,
   created_at timestamp with time zone,
   payment_status text, payment_method text, payment_gateway text,
   gateway_payment_id text, gateway_order_id text, paid_at timestamp with time zone
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
           a.gateway_payment_id, a.gateway_order_id, a.paid_at
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
GRANT EXECUTE ON FUNCTION public.get_appointment_by_token(uuid, text, text) TO anon, authenticated;
