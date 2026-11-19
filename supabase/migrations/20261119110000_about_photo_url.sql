-- The About section photo is now its own setting, independent of the profile
-- photo (navbar avatar) and the hero photo.
ALTER TABLE public.website_settings
  ADD COLUMN IF NOT EXISTS about_photo_url text;
