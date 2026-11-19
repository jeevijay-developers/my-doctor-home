-- The Blog section on a doctor's website is now on by default. With no published
-- posts the public page shows a "no blogs available" message instead of hiding it.
ALTER TABLE public.website_settings ALTER COLUMN show_blog SET DEFAULT true;

-- Backfill only doctors whose blog was never auto-enabled (i.e. never touched the
-- switch via the old first-publish flow); leave deliberate "off" choices alone.
UPDATE public.website_settings
SET show_blog = true
WHERE show_blog = false AND COALESCE(blog_auto_enabled, false) = false;
