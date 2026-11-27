-- Social Media Marketing as an optional add-on of a custom plan.
--
-- This is a SERVICE the company team delivers, not a software feature, so nothing in the app
-- gates on it. The database only records the agreed scope against the clinic's custom plan and
-- refuses to mark it Active until scope, account access, fee and the client's agreement are
-- all documented ("no marketing activity is promised until everything is on record").
--
-- Lifecycle: draft -> active -> ended.
--   * Rows are written ONLY through the three RPCs below (no client write policy).
--   * Saving a changed scope on an active record sends it back to draft and clears the agreement.
--   * It ends when its custom plan is cancelled or expires (trigger).
--   * The fee is billed outside the app; nothing here touches Razorpay or plan payments.

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.custom_plan_social_marketing (
  doctor_id uuid PRIMARY KEY REFERENCES public.doctor_custom_plans(doctor_id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'ended')),

  platforms text[] NOT NULL DEFAULT '{}',
  posts_per_month integer CHECK (posts_per_month IS NULL OR posts_per_month BETWEEN 1 AND 1000),
  post_types text[] NOT NULL DEFAULT '{}',
  creative_included boolean NOT NULL DEFAULT false,
  calendar_included boolean NOT NULL DEFAULT false,
  publishing_by text CHECK (publishing_by IS NULL OR publishing_by IN ('company', 'clinic')),
  community_management boolean NOT NULL DEFAULT false,
  paid_ads boolean NOT NULL DEFAULT false,
  ad_spend_monthly numeric CHECK (ad_spend_monthly IS NULL OR ad_spend_monthly >= 0),
  reporting_frequency text CHECK (reporting_frequency IS NULL OR reporting_frequency IN ('weekly', 'fortnightly', 'monthly', 'quarterly')),
  monthly_fee numeric CHECK (monthly_fee IS NULL OR monthly_fee >= 0),
  approval_process text CHECK (approval_process IS NULL OR approval_process IN ('each_post', 'monthly_calendar')),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),

  access_confirmed boolean NOT NULL DEFAULT false,
  agreed boolean NOT NULL DEFAULT false,
  agreed_on date,
  agreement_ref text CHECK (agreement_ref IS NULL OR char_length(agreement_ref) <= 500),

  activated_at timestamptz,
  activated_by uuid,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT social_marketing_platforms_valid CHECK (platforms <@ ARRAY['instagram','facebook','youtube','linkedin','x','google_business']),
  CONSTRAINT social_marketing_post_types_valid CHECK (post_types <@ ARRAY['static','reel','story','carousel'])
);

CREATE TRIGGER update_social_marketing_updated_at BEFORE UPDATE ON public.custom_plan_social_marketing
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.custom_plan_social_marketing ENABLE ROW LEVEL SECURITY;

-- True while the clinic's custom plan is live (active status, inside its dates).
CREATE OR REPLACE FUNCTION public.social_marketing_plan_live(_doctor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.doctor_custom_plans cp
    WHERE cp.doctor_id = _doctor_id AND cp.status = 'active'
      AND cp.valid_from <= now() AND (cp.valid_until IS NULL OR cp.valid_until > now())
  );
$$;
REVOKE ALL ON FUNCTION public.social_marketing_plan_live(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_marketing_plan_live(uuid) TO authenticated;

-- Read-only for clients. Superadmin reviewers see everything; the clinic (owner or staff) sees
-- its own row ONLY while it is active on a live plan, never an unconfirmed draft.
CREATE POLICY "Reviewers view social marketing" ON public.custom_plan_social_marketing
  FOR SELECT USING (public.sa_has_permission((SELECT auth.uid()), 'plan_requests.view'));
CREATE POLICY "Clinic views its active social marketing" ON public.custom_plan_social_marketing
  FOR SELECT USING (
    status = 'active'
    AND public.social_marketing_plan_live(doctor_id)
    AND ((SELECT auth.uid()) = doctor_id OR public.staff_doctor_id((SELECT auth.uid())) = doctor_id)
  );

-- ---------------------------------------------------------------------------
-- 2. The one activation gate. src/lib/socialMarketing.ts (missingForActivation) mirrors it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.social_marketing_missing(r public.custom_plan_social_marketing)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  m text[] := '{}';
BEGIN
  IF cardinality(r.platforms) = 0 THEN m := m || 'platforms'; END IF;
  IF r.posts_per_month IS NULL THEN m := m || 'posts_per_month'; END IF;
  IF cardinality(r.post_types) = 0 THEN m := m || 'post_types'; END IF;
  IF r.publishing_by IS NULL THEN m := m || 'publishing_by'; END IF;
  IF r.reporting_frequency IS NULL THEN m := m || 'reporting_frequency'; END IF;
  IF r.approval_process IS NULL THEN m := m || 'approval_process'; END IF;
  IF r.monthly_fee IS NULL THEN m := m || 'monthly_fee'; END IF;
  IF r.paid_ads AND r.ad_spend_monthly IS NULL THEN m := m || 'ad_spend_monthly'; END IF;
  IF NOT r.access_confirmed THEN m := m || 'access_confirmed'; END IF;
  IF NOT r.agreed OR r.agreed_on IS NULL OR btrim(COALESCE(r.agreement_ref, '')) = '' THEN m := m || 'agreement'; END IF;
  RETURN m;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Save the scope (full replace). Creates the record as a draft the first time.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_social_marketing_scope(
  _doctor_id uuid,
  _platforms text[],
  _posts_per_month integer,
  _post_types text[],
  _creative_included boolean,
  _calendar_included boolean,
  _publishing_by text,
  _community_management boolean,
  _paid_ads boolean,
  _ad_spend_monthly numeric,
  _reporting_frequency text,
  _monthly_fee numeric,
  _approval_process text,
  _notes text,
  _access_confirmed boolean,
  _agreed boolean,
  _agreed_on date,
  _agreement_ref text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  old public.custom_plan_social_marketing%ROWTYPE;
  new_row public.custom_plan_social_marketing%ROWTYPE;
  had_row boolean;
  scope_changed boolean;
  v_agreed boolean := COALESCE(_agreed, false);
  v_status text;
BEGIN
  IF NOT COALESCE(public.sa_has_permission(uid, 'plan_requests.manage'), false) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF NOT public.social_marketing_plan_live(_doctor_id) THEN
    RAISE EXCEPTION 'Social media marketing needs an active custom plan for this doctor';
  END IF;

  SELECT * INTO old FROM public.custom_plan_social_marketing WHERE doctor_id = _doctor_id FOR UPDATE;
  had_row := FOUND;

  -- A changed scope invalidates the agreement the client gave to the old one.
  scope_changed := had_row AND (
    old.platforms IS DISTINCT FROM COALESCE(_platforms, '{}')
    OR old.posts_per_month IS DISTINCT FROM _posts_per_month
    OR old.post_types IS DISTINCT FROM COALESCE(_post_types, '{}')
    OR old.creative_included IS DISTINCT FROM COALESCE(_creative_included, false)
    OR old.calendar_included IS DISTINCT FROM COALESCE(_calendar_included, false)
    OR old.publishing_by IS DISTINCT FROM _publishing_by
    OR old.community_management IS DISTINCT FROM COALESCE(_community_management, false)
    OR old.paid_ads IS DISTINCT FROM COALESCE(_paid_ads, false)
    OR old.ad_spend_monthly IS DISTINCT FROM _ad_spend_monthly
    OR old.reporting_frequency IS DISTINCT FROM _reporting_frequency
    OR old.monthly_fee IS DISTINCT FROM _monthly_fee
    OR old.approval_process IS DISTINCT FROM _approval_process
  );
  -- Must be re-recorded for a new scope, and for a new engagement after an ended one.
  IF had_row AND ((scope_changed AND old.status = 'active') OR old.status = 'ended') THEN
    v_agreed := false;
  END IF;

  INSERT INTO public.custom_plan_social_marketing AS s (
    doctor_id, status, platforms, posts_per_month, post_types, creative_included, calendar_included,
    publishing_by, community_management, paid_ads, ad_spend_monthly, reporting_frequency, monthly_fee,
    approval_process, notes, access_confirmed, agreed, agreed_on, agreement_ref
  ) VALUES (
    _doctor_id, 'draft', COALESCE(_platforms, '{}'), _posts_per_month, COALESCE(_post_types, '{}'),
    COALESCE(_creative_included, false), COALESCE(_calendar_included, false),
    _publishing_by, COALESCE(_community_management, false), COALESCE(_paid_ads, false), _ad_spend_monthly,
    _reporting_frequency, _monthly_fee, _approval_process, NULLIF(btrim(COALESCE(_notes, '')), ''),
    COALESCE(_access_confirmed, false), v_agreed,
    CASE WHEN v_agreed THEN _agreed_on END, CASE WHEN v_agreed THEN NULLIF(btrim(COALESCE(_agreement_ref, '')), '') END
  )
  ON CONFLICT (doctor_id) DO UPDATE SET
    platforms = EXCLUDED.platforms,
    posts_per_month = EXCLUDED.posts_per_month,
    post_types = EXCLUDED.post_types,
    creative_included = EXCLUDED.creative_included,
    calendar_included = EXCLUDED.calendar_included,
    publishing_by = EXCLUDED.publishing_by,
    community_management = EXCLUDED.community_management,
    paid_ads = EXCLUDED.paid_ads,
    ad_spend_monthly = EXCLUDED.ad_spend_monthly,
    reporting_frequency = EXCLUDED.reporting_frequency,
    monthly_fee = EXCLUDED.monthly_fee,
    approval_process = EXCLUDED.approval_process,
    notes = EXCLUDED.notes,
    access_confirmed = EXCLUDED.access_confirmed,
    agreed = EXCLUDED.agreed,
    agreed_on = EXCLUDED.agreed_on,
    agreement_ref = EXCLUDED.agreement_ref,
    -- an ended record is re-scoped as a new draft; an active one stays active only if still complete
    status = 'draft',
    activated_at = NULL,
    activated_by = NULL,
    ended_at = NULL
  RETURNING * INTO new_row;

  -- An active record whose scope did not change and is still complete stays active.
  IF had_row AND old.status = 'active' AND NOT scope_changed AND cardinality(public.social_marketing_missing(new_row)) = 0 THEN
    UPDATE public.custom_plan_social_marketing
       SET status = 'active', activated_at = old.activated_at, activated_by = old.activated_by
     WHERE doctor_id = _doctor_id;
    v_status := 'active';
  ELSE
    v_status := 'draft';
  END IF;

  IF had_row AND old.status = 'active' AND v_status = 'draft' THEN
    INSERT INTO public.notifications (doctor_id, recipient_user_id, source_type, title, message)
    VALUES (_doctor_id, _doctor_id, 'plan_request', 'Social media marketing is being updated',
      'The scope of your social media marketing service is being revised. It will be shown here again once the new scope is confirmed.');
  END IF;

  INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, details)
  VALUES (uid, 'save_social_marketing_scope', 'custom_plan_social_marketing', _doctor_id,
    jsonb_build_object('status', v_status, 'scope_changed', scope_changed, 'monthly_fee', _monthly_fee));

  RETURN v_status;
END;
$$;
REVOKE ALL ON FUNCTION public.save_social_marketing_scope(uuid, text[], integer, text[], boolean, boolean, text, boolean, boolean, numeric, text, numeric, text, text, boolean, boolean, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_social_marketing_scope(uuid, text[], integer, text[], boolean, boolean, text, boolean, boolean, numeric, text, numeric, text, text, boolean, boolean, date, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Activate: refused unless everything is on record
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_social_marketing(_doctor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  r public.custom_plan_social_marketing%ROWTYPE;
  missing text[];
BEGIN
  IF NOT COALESCE(public.sa_has_permission(uid, 'plan_requests.manage'), false) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF NOT public.social_marketing_plan_live(_doctor_id) THEN
    RAISE EXCEPTION 'Social media marketing needs an active custom plan for this doctor';
  END IF;

  SELECT * INTO r FROM public.custom_plan_social_marketing WHERE doctor_id = _doctor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Save the scope first'; END IF;
  IF r.status = 'active' THEN RETURN; END IF;

  missing := public.social_marketing_missing(r);
  IF cardinality(missing) > 0 THEN
    RAISE EXCEPTION 'SOCIAL_MARKETING_INCOMPLETE: still missing %', array_to_string(missing, ', ');
  END IF;

  UPDATE public.custom_plan_social_marketing
     SET status = 'active', activated_at = now(), activated_by = uid, ended_at = NULL
   WHERE doctor_id = _doctor_id;

  INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, details)
  VALUES (uid, 'activate_social_marketing', 'custom_plan_social_marketing', _doctor_id,
    jsonb_build_object('monthly_fee', r.monthly_fee, 'agreed_on', r.agreed_on, 'agreement_ref', r.agreement_ref));
  INSERT INTO public.notifications (doctor_id, recipient_user_id, source_type, title, message)
  VALUES (_doctor_id, _doctor_id, 'plan_request', 'Social media marketing is now active',
    'Your social media marketing service is active. You can see what is included under your custom plan.');
END;
$$;
REVOKE ALL ON FUNCTION public.activate_social_marketing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_social_marketing(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. End it by hand
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.end_social_marketing(_doctor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  was text;
BEGIN
  IF NOT COALESCE(public.sa_has_permission(uid, 'plan_requests.manage'), false) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT status INTO was FROM public.custom_plan_social_marketing WHERE doctor_id = _doctor_id FOR UPDATE;
  IF NOT FOUND OR was = 'ended' THEN RETURN; END IF;

  UPDATE public.custom_plan_social_marketing SET status = 'ended', ended_at = now() WHERE doctor_id = _doctor_id;
  INSERT INTO public.admin_audit_log (admin_user_id, action, target_table, target_id, details)
  VALUES (uid, 'end_social_marketing', 'custom_plan_social_marketing', _doctor_id, jsonb_build_object('was', was));
  IF was = 'active' THEN
    INSERT INTO public.notifications (doctor_id, recipient_user_id, source_type, title, message)
    VALUES (_doctor_id, _doctor_id, 'plan_request', 'Social media marketing has ended',
      'Your social media marketing service has ended.');
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.end_social_marketing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_social_marketing(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. It cannot outlive its custom plan (cancel and the expiry cron both set status)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.end_social_marketing_with_plan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  was text;
BEGIN
  SELECT status INTO was FROM public.custom_plan_social_marketing WHERE doctor_id = NEW.doctor_id;
  IF was IS NULL OR was = 'ended' THEN RETURN NEW; END IF;
  UPDATE public.custom_plan_social_marketing SET status = 'ended', ended_at = now() WHERE doctor_id = NEW.doctor_id;
  IF was = 'active' THEN
    INSERT INTO public.notifications (doctor_id, recipient_user_id, source_type, title, message)
    VALUES (NEW.doctor_id, NEW.doctor_id, 'plan_request', 'Social media marketing has ended',
      'Your social media marketing service ended together with your custom plan.');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_end_social_marketing_with_plan ON public.doctor_custom_plans;
CREATE TRIGGER trg_end_social_marketing_with_plan
  AFTER UPDATE OF status ON public.doctor_custom_plans
  FOR EACH ROW WHEN (OLD.status = 'active' AND NEW.status <> 'active')
  EXECUTE FUNCTION public.end_social_marketing_with_plan();

-- ---------------------------------------------------------------------------
-- 7. Realtime: the superadmin list and the doctor's card refresh live (RLS still applies per row)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'custom_plan_social_marketing'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.custom_plan_social_marketing;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
