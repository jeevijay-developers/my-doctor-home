-- Backfill for the patient lifecycle (20261029120000).
--
-- Patients made by the FIRST version of the booking trigger (20261029100000) were not
-- flagged auto_created and were given first/last visit dates at booking time, so a
-- booked-but-never-seen person looked like someone who had visited. They would also
-- never be released on cancel/no-show. This flags them, clears the bogus dates and
-- releases the ones whose bookings are already all closed.
--
-- A trigger-made patient is recognisable: it was inserted in the same transaction as
-- its appointment, so its created_at equals that appointment's created_at/updated_at to
-- the microsecond. Patients typed in by a person never match that.

UPDATE public.patients p
   SET auto_created = true
 WHERE NOT p.auto_created
   AND EXISTS (SELECT 1 FROM public.appointments a
                WHERE a.patient_id = p.id
                  AND (a.created_at = p.created_at OR a.updated_at = p.created_at));

-- A never-visited patient has no visit dates.
UPDATE public.patients
   SET first_visit = NULL, last_visit = NULL
 WHERE auto_created AND total_visits = 0
   AND (first_visit IS NOT NULL OR last_visit IS NOT NULL);

DO $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT p.id FROM public.patients p
     WHERE p.auto_created AND p.total_visits = 0
       AND NOT EXISTS (SELECT 1 FROM public.appointments a
                        WHERE a.patient_id = p.id
                          AND a.status::text IN ('pending', 'confirmed', 'completed'))
  LOOP
    IF public.release_provisional_patient(r.id) THEN n := n + 1; END IF;
  END LOOP;
  RAISE NOTICE 'released % provisional patients', n;
END $$;
