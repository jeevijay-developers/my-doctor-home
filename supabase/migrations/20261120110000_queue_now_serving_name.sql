-- The public queue screen now also shows WHO is being served, but only as a masked name
-- ("Aaryan K."): first name plus the initial of the last word. The full name never leaves the
-- database, and no other patient (waiting, done) is named.
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
           row_number() OVER (ORDER BY priority DESC, sort_time, created_at, id) AS rn
      FROM appts
     WHERE status IN ('pending', 'confirmed') AND skipped_at IS NULL AND serving_started_at IS NULL
  ),
  recent AS (
    SELECT EXTRACT(EPOCH FROM (completed_at - serving_started_at)) / 60.0 AS minutes
      FROM appts
     WHERE status = 'completed' AND serving_started_at IS NOT NULL AND completed_at IS NOT NULL
       AND completed_at > serving_started_at
     ORDER BY completed_at DESC LIMIT 10
  ),
  serving AS (
    SELECT queue_number, btrim(regexp_replace(COALESCE(patient_name, ''), '\s+', ' ', 'g')) AS nm
      FROM appts
     WHERE serving_started_at IS NOT NULL AND status IN ('pending', 'confirmed') LIMIT 1
  )
  SELECT jsonb_build_object(
    'now_serving', (SELECT queue_number FROM serving),
    'now_serving_name', (SELECT CASE
        WHEN nm = '' THEN NULL
        WHEN position(' ' IN nm) = 0 THEN nm
        ELSE split_part(nm, ' ', 1) || ' ' || upper(left((regexp_split_to_array(nm, ' '))[array_length(regexp_split_to_array(nm, ' '), 1)], 1)) || '.'
      END FROM serving),
    'next_up',     COALESCE((SELECT jsonb_agg(queue_number ORDER BY rn) FROM waiting WHERE rn <= 5), '[]'::jsonb),
    'waiting',     (SELECT count(*) FROM waiting),
    'done',        (SELECT count(*) FROM appts WHERE status = 'completed'),
    'avg_minutes', (SELECT round(avg(minutes)::numeric, 1) FROM recent),
    'updated_at',  now()
  );
$$;
REVOKE EXECUTE ON FUNCTION public.get_public_queue(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_queue(uuid) TO anon, authenticated;
