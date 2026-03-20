
-- Fix: Require doctor_id to be a valid profile for public inserts
DROP POLICY "Public can create appointments" ON public.appointments;
CREATE POLICY "Public can create appointments" ON public.appointments 
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = doctor_id AND onboarding_completed = true)
  );

DROP POLICY "Public can create reviews" ON public.reviews;
CREATE POLICY "Public can create reviews" ON public.reviews 
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = doctor_id AND onboarding_completed = true)
  );
