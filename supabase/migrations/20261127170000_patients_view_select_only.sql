-- Review fix for 20261127120000: REVOKE ... FROM PUBLIC, anon does not touch the grants Supabase's default
-- privileges gave `authenticated` on creation, so the view carried INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/
-- TRIGGER for signed-in users. The view is not auto-updatable (LATERAL join), so writes already failed, but a
-- reader view must be SELECT-only (TRIGGER would even let a client attach an INSTEAD OF trigger to it).
REVOKE ALL ON public.patients_with_doctors FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.patients_with_doctors TO authenticated;
