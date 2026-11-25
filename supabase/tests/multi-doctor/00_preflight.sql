-- Multi-doctor P0 pre-flight. Read-only. Every number must be 0 and existing_table NULL.
--   npx supabase db query --linked -f supabase/tests/multi-doctor/00_preflight.sql
SELECT 'existing_table' AS check, to_regclass('public.practitioners')::text AS value
UNION ALL
SELECT 'orphan appointments', count(*)::text FROM public.appointments x
 WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = x.doctor_id)
UNION ALL
SELECT 'orphan working_hours', count(*)::text FROM public.working_hours x
 WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = x.doctor_id)
UNION ALL
SELECT 'orphan prescriptions', count(*)::text FROM public.prescriptions x
 WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = x.doctor_id)
UNION ALL
SELECT 'orphan patient_visits', count(*)::text FROM public.patient_visits x
 WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = x.doctor_id)
UNION ALL
SELECT 'orphan patient_documents', count(*)::text FROM public.patient_documents x
 WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = x.doctor_id)
UNION ALL
-- The backfill runs with ENABLE/DISABLE TRIGGER USER, which would switch an
-- intentionally disabled trigger back on.
SELECT 'disabled triggers', count(*)::text FROM pg_trigger
 WHERE NOT tgisinternal AND tgenabled <> 'O'
   AND tgrelid IN ('public.appointments'::regclass, 'public.working_hours'::regclass,
                   'public.prescriptions'::regclass, 'public.patient_visits'::regclass)
UNION ALL
SELECT 'rows appointments', n_live_tup::text FROM pg_stat_user_tables WHERE relname = 'appointments';
