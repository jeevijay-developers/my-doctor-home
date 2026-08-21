-- ============================================
-- PER-DOCTOR FEATURE ENTITLEMENT OVERRIDES
-- ============================================
-- Today "premium feature" is a single binary (doctor_has_premium_access, see
-- plan_gating_core.sql) fanned out to five separate UI gates: Online
-- Consultation, AI Blog Writer, Billing & Invoices, Patient Medical Records,
-- Staff Management. This adds a per-doctor override layer on top of that
-- plan default so Superadmin can unlock (or revoke) one feature for one
-- doctor without touching their plan/billing — e.g. a support exception or a
-- time-limited trial of a feature.
--
-- `features` is the canonical key list both the plan-default check and the
-- override table reference, so feature keys are never hardcoded/duplicated
-- across the two. Everything with default_min_tier = 'premium' falls back to
-- the exact same doctor_has_premium_access() logic already in production;
-- nothing about existing plan-based gating changes for doctors with no
-- overrides.

CREATE TABLE public.features (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL,
  default_min_tier text NOT NULL DEFAULT 'premium' CHECK (default_min_tier IN ('pro', 'premium')),
  sort_order integer NOT NULL DEFAULT 0
);

INSERT INTO public.features (key, label, description, default_min_tier, sort_order) VALUES
  ('online_consultation', 'Online Consultation', 'Video consultations via Zoom, with fee and duration settings.', 'premium', 1),
  ('ai_blog_writer', 'AI Blog Writer', 'Generate patient-friendly health articles with AI in seconds.', 'pro', 2),
  ('billing_invoices', 'Billing & Invoices', 'Track revenue, auto-generate GST invoices, and export transactions.', 'pro', 3),
  ('patient_records', 'Patient Medical Records', 'Open a patient''s full medical history, prescriptions, documents and visit timeline.', 'premium', 4),
  ('staff_management', 'Staff Management', 'Add clinic staff accounts and control exactly what each one can see and do.', 'premium', 5);

ALTER TABLE public.features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read features" ON public.features
  FOR SELECT USING (true);
CREATE POLICY "Admins manage features" ON public.features
  FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================
-- DOCTOR_FEATURE_OVERRIDES
-- ============================================
CREATE TABLE public.doctor_feature_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  feature_key text NOT NULL REFERENCES public.features(key) ON DELETE CASCADE,
  enabled boolean NOT NULL,
  granted_by uuid NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (doctor_id, feature_key)
);

CREATE INDEX idx_doctor_feature_overrides_doctor ON public.doctor_feature_overrides(doctor_id);

CREATE TRIGGER update_doctor_feature_overrides_updated_at BEFORE UPDATE ON public.doctor_feature_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.doctor_feature_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctors view own feature overrides" ON public.doctor_feature_overrides
  FOR SELECT USING (auth.uid() = doctor_id);
CREATE POLICY "Staff view feature overrides" ON public.doctor_feature_overrides
  FOR SELECT USING (public.staff_doctor_id(auth.uid()) = doctor_id);
CREATE POLICY "Admins manage feature overrides" ON public.doctor_feature_overrides
  FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================
-- doctor_has_feature — the single authority every gate (client hook, public
-- booking site) should call instead of checking plan tier directly. An
-- active (non-expired) override always wins; otherwise falls back to the
-- feature's plan default.
-- ============================================
CREATE OR REPLACE FUNCTION public.doctor_has_feature(_doctor_id uuid, _feature_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  override_enabled boolean;
  min_tier text;
BEGIN
  SELECT enabled INTO override_enabled
  FROM public.doctor_feature_overrides
  WHERE doctor_id = _doctor_id AND feature_key = _feature_key
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;

  IF override_enabled IS NOT NULL THEN
    RETURN override_enabled;
  END IF;

  SELECT default_min_tier INTO min_tier FROM public.features WHERE key = _feature_key;
  IF min_tier IS NULL THEN
    RETURN false;
  END IF;

  IF min_tier = 'premium' THEN
    RETURN public.doctor_has_premium_access(_doctor_id);
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.doctor_has_feature(uuid, text) TO authenticated, anon;

-- Anon-safe bulk variant for the public doctor site (patient booking flow has
-- no auth session) — same resolution logic as doctor_has_feature, just
-- fanned out over every feature in one round trip instead of N calls.
CREATE OR REPLACE FUNCTION public.get_public_feature_flags(_doctor_id uuid)
RETURNS TABLE(feature_key text, effective_enabled boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT f.key, public.doctor_has_feature(_doctor_id, f.key)
  FROM public.features f;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_feature_flags(uuid) TO authenticated, anon;

-- Full detail bulk RPC for the doctor's own admin panel and for Superadmin's
-- doctor-detail Feature Access screen — every feature, whether it's in the
-- doctor's plan by default, and the override row's state if any. Restricted
-- to the doctor themselves, their staff, or an admin (SECURITY DEFINER
-- bypasses RLS, so this check stands in for it).
CREATE OR REPLACE FUNCTION public.get_doctor_feature_access(_doctor_id uuid)
RETURNS TABLE(
  feature_key text,
  label text,
  description text,
  default_min_tier text,
  included_by_plan boolean,
  override_enabled boolean,
  override_granted_by uuid,
  override_granted_at timestamptz,
  override_reason text,
  override_expires_at timestamptz,
  override_active boolean,
  effective_enabled boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM _doctor_id
     AND public.staff_doctor_id(auth.uid()) IS DISTINCT FROM _doctor_id
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT
    f.key,
    f.label,
    f.description,
    f.default_min_tier,
    (CASE WHEN f.default_min_tier = 'premium' THEN public.doctor_has_premium_access(_doctor_id) ELSE true END) AS included_by_plan,
    o.enabled AS override_enabled,
    o.granted_by AS override_granted_by,
    o.granted_at AS override_granted_at,
    o.reason AS override_reason,
    o.expires_at AS override_expires_at,
    (o.enabled IS NOT NULL AND (o.expires_at IS NULL OR o.expires_at > now())) AS override_active,
    COALESCE(
      CASE WHEN o.enabled IS NOT NULL AND (o.expires_at IS NULL OR o.expires_at > now()) THEN o.enabled END,
      CASE WHEN f.default_min_tier = 'premium' THEN public.doctor_has_premium_access(_doctor_id) ELSE true END
    ) AS effective_enabled
  FROM public.features f
  LEFT JOIN public.doctor_feature_overrides o ON o.feature_key = f.key AND o.doctor_id = _doctor_id
  ORDER BY f.sort_order;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_doctor_feature_access(uuid) TO authenticated;
