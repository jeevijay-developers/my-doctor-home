
-- Allow anonymous users to create patients when booking
CREATE POLICY "Public can create patients for valid doctors"
ON public.patients FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM profiles WHERE profiles.id = patients.doctor_id AND profiles.onboarding_completed = true
));
