-- ============================================
-- HERO BANNER — editable content
-- ============================================
-- The public-site Hero Banner (src/components/doctor/HeroBanner.tsx) was
-- entirely hardcoded copy with no corresponding columns, so the My Website
-- editor had nothing to bind an editor panel to. These columns hold that
-- copy per-doctor; DEFAULT values match the previously-hardcoded strings
-- exactly, so every existing doctor's live Hero renders identically the
-- moment this migration runs (Postgres backfills the default into every
-- existing row for a column-add with a DEFAULT) — no blank-hero regression,
-- no separate backfill step needed.
ALTER TABLE public.website_settings
  ADD COLUMN hero_headline_line1 text NOT NULL DEFAULT 'Trusted Care for',
  ADD COLUMN hero_headline_line2 text NOT NULL DEFAULT 'You & Your Family',
  ADD COLUMN hero_description text NOT NULL DEFAULT 'Compassionate, personalized and professional healthcare for a better tomorrow.',
  ADD COLUMN hero_location_label text NOT NULL DEFAULT 'Clinic Location',
  ADD COLUMN hero_hours_label text NOT NULL DEFAULT 'Consultation',
  ADD COLUMN hero_primary_button_label text NOT NULL DEFAULT 'Book Appointment',
  ADD COLUMN hero_secondary_button_label text NOT NULL DEFAULT 'Call Now',
  ADD COLUMN hero_directions_label text NOT NULL DEFAULT 'Get Directions',
  ADD COLUMN hero_stat_text text NOT NULL DEFAULT '5,000+ Patient Consultations',
  ADD COLUMN show_hero_stat_badge boolean NOT NULL DEFAULT true;

-- No new RLS policies needed: website_settings already has "Doctors manage
-- own website_settings" (FOR ALL) plus the staff website.edit/website.settings
-- UPDATE policy from staff_permission_policies.sql, both of which operate on
-- the whole row and so already cover these new columns.
