-- Which doctors has each patient been seen by? (multi-doctor clinics)
-- Patients stay clinic-level. This view adds, per patient, the distinct practitioners that have a
-- non-cancelled appointment, a live patient_visits row or a prescription for them, plus the most
-- recent one. security_invoker = true: every row is read with the CALLER's rights, so the patients
-- RLS and the clinical-visibility ('treating') policies on appointments / patient_visits /
-- prescriptions still decide what a doctor login sees. Nothing is exposed to anon.
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON public.prescriptions (patient_id) WHERE patient_id IS NOT NULL;

CREATE OR REPLACE VIEW public.patients_with_doctors WITH (security_invoker = true) AS
  SELECT p.*,
         COALESCE(x.practitioner_ids, '{}'::uuid[]) AS practitioner_ids,
         x.last_practitioner_id
    FROM public.patients p
    LEFT JOIN LATERAL (
      SELECT array_agg(DISTINCT u.practitioner_id) AS practitioner_ids,
             (array_agg(u.practitioner_id ORDER BY u.at DESC))[1] AS last_practitioner_id
        FROM (
          SELECT a.practitioner_id, a.date::timestamptz AS at
            FROM public.appointments a
           WHERE a.patient_id = p.id AND a.status::text <> 'cancelled'
          UNION ALL
          SELECT v.practitioner_id, v.visit_date::timestamptz
            FROM public.patient_visits v
           WHERE v.patient_id = p.id AND v.deleted_at IS NULL
          UNION ALL
          SELECT r.practitioner_id, r.created_at
            FROM public.prescriptions r
           WHERE r.patient_id = p.id
        ) u
    ) x ON true;

REVOKE ALL ON public.patients_with_doctors FROM PUBLIC, anon;
GRANT SELECT ON public.patients_with_doctors TO authenticated;
