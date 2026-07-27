
CREATE TABLE public.slug_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  doctor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  old_slug text NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_slug_history_old_slug ON public.slug_history(old_slug);
CREATE INDEX idx_slug_history_doctor_id ON public.slug_history(doctor_id);

GRANT SELECT ON public.slug_history TO anon;
GRANT SELECT, INSERT ON public.slug_history TO authenticated;
GRANT ALL ON public.slug_history TO service_role;

ALTER TABLE public.slug_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read slug history"
  ON public.slug_history FOR SELECT
  USING (true);

CREATE POLICY "Doctors can insert their own slug history"
  ON public.slug_history FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = doctor_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
