ALTER TABLE public.website_settings
  ADD COLUMN IF NOT EXISTS hero_photo_url text,
  ADD COLUMN IF NOT EXISTS hero_stat_icon text NOT NULL DEFAULT 'Star';
