ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS zoom_meeting_id text,
  ADD COLUMN IF NOT EXISTS zoom_join_url text,
  ADD COLUMN IF NOT EXISTS zoom_start_url text;

-- Column-level privileges: hide zoom_start_url from anon completely.
-- Doctors query as `authenticated` and are further scoped by row-level RLS.
REVOKE SELECT (zoom_start_url) ON public.appointments FROM anon;
REVOKE SELECT (zoom_start_url) ON public.appointments FROM PUBLIC;
GRANT SELECT (zoom_start_url) ON public.appointments TO authenticated;
GRANT SELECT (zoom_start_url) ON public.appointments TO service_role;