
-- ============================================
-- SERVICES TABLE
-- ============================================
CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price integer NOT NULL DEFAULT 0,
  type text NOT NULL DEFAULT 'clinic' CHECK (type IN ('clinic', 'online', 'both')),
  duration integer DEFAULT 30,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctors can manage own services" ON public.services FOR ALL USING (auth.uid() = doctor_id) WITH CHECK (auth.uid() = doctor_id);
CREATE POLICY "Public can view active services" ON public.services FOR SELECT USING (active = true);

CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- PACKAGES TABLE
-- ============================================
CREATE TABLE public.packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  tagline text,
  price integer NOT NULL DEFAULT 0,
  original_price integer,
  duration text DEFAULT '1 Month',
  features jsonb DEFAULT '[]'::jsonb,
  slots_available integer,
  is_popular boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctors can manage own packages" ON public.packages FOR ALL USING (auth.uid() = doctor_id) WITH CHECK (auth.uid() = doctor_id);
CREATE POLICY "Public can view active packages" ON public.packages FOR SELECT USING (active = true);

CREATE TRIGGER update_packages_updated_at BEFORE UPDATE ON public.packages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- WORKING HOURS TABLE
-- ============================================
CREATE TABLE public.working_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  is_open boolean NOT NULL DEFAULT false,
  start_time time,
  end_time time,
  start_time_2 time,
  end_time_2 time,
  UNIQUE(doctor_id, day_of_week)
);

ALTER TABLE public.working_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctors can manage own hours" ON public.working_hours FOR ALL USING (auth.uid() = doctor_id) WITH CHECK (auth.uid() = doctor_id);
CREATE POLICY "Public can view working hours" ON public.working_hours FOR SELECT USING (true);

-- ============================================
-- APPOINTMENTS TABLE
-- ============================================
CREATE TYPE public.appointment_status AS ENUM ('pending', 'confirmed', 'completed', 'cancelled', 'no_show');
CREATE TYPE public.payment_status AS ENUM ('pending', 'paid', 'refunded', 'pay_at_clinic');

CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  patient_name text NOT NULL,
  patient_phone text NOT NULL,
  patient_age integer,
  patient_gender text,
  service_name text NOT NULL,
  appointment_type text NOT NULL DEFAULT 'clinic' CHECK (appointment_type IN ('clinic', 'online')),
  date date NOT NULL,
  time_slot time NOT NULL,
  status public.appointment_status NOT NULL DEFAULT 'pending',
  payment_status public.payment_status NOT NULL DEFAULT 'pending',
  amount integer NOT NULL DEFAULT 0,
  token_number text,
  chief_complaint text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctors can manage own appointments" ON public.appointments FOR ALL USING (auth.uid() = doctor_id) WITH CHECK (auth.uid() = doctor_id);
CREATE POLICY "Public can create appointments" ON public.appointments FOR INSERT WITH CHECK (true);

CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for appointments
ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;

-- ============================================
-- PATIENTS TABLE
-- ============================================
CREATE TABLE public.patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  email text,
  age integer,
  gender text,
  first_visit date,
  last_visit date,
  total_visits integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctors can manage own patients" ON public.patients FOR ALL USING (auth.uid() = doctor_id) WITH CHECK (auth.uid() = doctor_id);

CREATE TRIGGER update_patients_updated_at BEFORE UPDATE ON public.patients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- REVIEWS TABLE
-- ============================================
CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  patient_name text NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text text,
  is_verified boolean NOT NULL DEFAULT false,
  is_visible boolean NOT NULL DEFAULT true,
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctors can manage own reviews" ON public.reviews FOR ALL USING (auth.uid() = doctor_id) WITH CHECK (auth.uid() = doctor_id);
CREATE POLICY "Public can view visible reviews" ON public.reviews FOR SELECT USING (is_visible = true);
CREATE POLICY "Public can create reviews" ON public.reviews FOR INSERT WITH CHECK (true);

-- ============================================
-- GALLERY PHOTOS TABLE
-- ============================================
CREATE TABLE public.gallery_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  caption text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gallery_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctors can manage own gallery" ON public.gallery_photos FOR ALL USING (auth.uid() = doctor_id) WITH CHECK (auth.uid() = doctor_id);
CREATE POLICY "Public can view gallery" ON public.gallery_photos FOR SELECT USING (true);

-- ============================================
-- BLOG POSTS TABLE
-- ============================================
CREATE TABLE public.blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  excerpt text,
  content text,
  featured_image_url text,
  category text,
  is_published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctors can manage own blogs" ON public.blog_posts FOR ALL USING (auth.uid() = doctor_id) WITH CHECK (auth.uid() = doctor_id);
CREATE POLICY "Public can view published blogs" ON public.blog_posts FOR SELECT USING (is_published = true);

CREATE TRIGGER update_blog_posts_updated_at BEFORE UPDATE ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- WEBSITE SETTINGS TABLE
-- ============================================
CREATE TABLE public.website_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  theme text NOT NULL DEFAULT 'blue',
  seo_title text,
  seo_description text,
  seo_keywords text,
  whatsapp_number text,
  whatsapp_message text DEFAULT 'Hi Doctor, I would like to book an appointment.',
  social_facebook text,
  social_instagram text,
  social_youtube text,
  social_linkedin text,
  google_analytics_id text,
  show_online_consultation boolean NOT NULL DEFAULT false,
  online_fee integer DEFAULT 500,
  online_duration integer DEFAULT 30,
  booking_advance_days integer NOT NULL DEFAULT 7,
  require_payment boolean NOT NULL DEFAULT false,
  auto_confirm boolean NOT NULL DEFAULT true,
  max_per_slot integer NOT NULL DEFAULT 1,
  buffer_minutes integer NOT NULL DEFAULT 0,
  show_quick_stats boolean NOT NULL DEFAULT true,
  show_about boolean NOT NULL DEFAULT true,
  show_services boolean NOT NULL DEFAULT true,
  show_packages boolean NOT NULL DEFAULT false,
  show_gallery boolean NOT NULL DEFAULT false,
  show_reviews boolean NOT NULL DEFAULT true,
  show_blog boolean NOT NULL DEFAULT false,
  show_clinic_details boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.website_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctors can manage own settings" ON public.website_settings FOR ALL USING (auth.uid() = doctor_id) WITH CHECK (auth.uid() = doctor_id);
CREATE POLICY "Public can view settings" ON public.website_settings FOR SELECT USING (true);

CREATE TRIGGER update_website_settings_updated_at BEFORE UPDATE ON public.website_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- STORAGE BUCKET FOR DOCTOR UPLOADS
-- ============================================
INSERT INTO storage.buckets (id, name, public) VALUES ('doctor-uploads', 'doctor-uploads', true);

CREATE POLICY "Doctors can upload own files" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'doctor-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Doctors can update own files" ON storage.objects FOR UPDATE USING (bucket_id = 'doctor-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Doctors can delete own files" ON storage.objects FOR DELETE USING (bucket_id = 'doctor-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Public can view doctor uploads" ON storage.objects FOR SELECT USING (bucket_id = 'doctor-uploads');

-- ============================================
-- AUTO-CREATE WEBSITE SETTINGS ON PROFILE CREATE
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_profile_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.website_settings (doctor_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  -- Insert default working hours (Mon-Sat open, Sun closed)
  INSERT INTO public.working_hours (doctor_id, day_of_week, is_open, start_time, end_time, start_time_2, end_time_2)
  VALUES
    (NEW.id, 0, false, NULL, NULL, NULL, NULL),
    (NEW.id, 1, true, '09:00', '13:00', '17:00', '21:00'),
    (NEW.id, 2, true, '09:00', '13:00', '17:00', '21:00'),
    (NEW.id, 3, true, '09:00', '13:00', '17:00', '21:00'),
    (NEW.id, 4, true, '09:00', '13:00', '17:00', '21:00'),
    (NEW.id, 5, true, '09:00', '13:00', '17:00', '21:00'),
    (NEW.id, 6, true, '09:00', '14:00', NULL, NULL)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_profile_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_profile_settings();
