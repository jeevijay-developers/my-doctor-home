-- ============================================
-- SUPERADMIN TEAM — permission-scoped platform admins who log in with
-- phone + OTP from the main login page.
-- ============================================
-- Owners are users with user_roles.role = 'admin' (unchanged: full access, never
-- restricted). Team members are NOT given 'admin' (has_role('admin') means
-- everything, in 31 policies and 8 edge functions) — they live only in
-- public.superadmin_team_members, mirroring how doctor-owned staff live only in
-- staff_members. Access is granted by ADDING policies below (each OR-ed with the
-- untouched owner policies) that check sa_has_permission(). Team management
-- itself is owner-only so a member can never grant themselves more access.

-- The old email-invite 'staff' role granted nothing anywhere; drop its rows.
DELETE FROM public.user_roles WHERE role = 'staff';

CREATE TABLE public.superadmin_team_members (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  last_login_at timestamptz
);
CREATE UNIQUE INDEX idx_superadmin_team_members_phone ON public.superadmin_team_members (phone);

CREATE TRIGGER update_superadmin_team_members_updated_at BEFORE UPDATE ON public.superadmin_team_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- helpers ----------
CREATE OR REPLACE FUNCTION public.is_active_team_member(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.superadmin_team_members WHERE id = _user_id AND status = 'active')
$$;

-- Owners hold every permission; team members hold exactly their flags (and only
-- while active).
CREATE OR REPLACE FUNCTION public.sa_has_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
    OR COALESCE((
      SELECT (permissions ->> _permission)::boolean
      FROM public.superadmin_team_members WHERE id = _user_id AND status = 'active'
    ), false)
$$;

CREATE OR REPLACE FUNCTION public.sa_has_any_permission(_user_id uuid, _permissions text[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
    OR EXISTS (
      SELECT 1 FROM public.superadmin_team_members m, unnest(_permissions) p
      WHERE m.id = _user_id AND m.status = 'active' AND COALESCE((m.permissions ->> p)::boolean, false)
    )
$$;

GRANT EXECUTE ON FUNCTION public.is_active_team_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sa_has_permission(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sa_has_any_permission(uuid, text[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.touch_team_login()
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.superadmin_team_members SET last_login_at = now() WHERE id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.touch_team_login() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_team_login() TO authenticated;

-- ---------- table RLS ----------
ALTER TABLE public.superadmin_team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage team" ON public.superadmin_team_members
  FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Team member can view own record" ON public.superadmin_team_members
  FOR SELECT USING (auth.uid() = id);

-- ---------- handle_new_user: skip the doctor bootstrap for team accounts ----------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_phone_digits text;
BEGIN
  IF NEW.raw_user_meta_data->>'account_type' IN ('staff', 'superadmin_team') THEN
    RETURN NEW;
  END IF;

  v_phone_digits := regexp_replace(COALESCE(NEW.phone, NEW.raw_user_meta_data->>'phone', ''), '[^\d]', '', 'g');

  -- Permanent superadmin-only number.
  IF right(v_phone_digits, 10) = '8871876376' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'doctor');

  IF right(v_phone_digits, 10) = '9752430783' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------- get_doctor_feature_access: also callable by permitted team members ----------
CREATE OR REPLACE FUNCTION public.get_doctor_feature_access(_doctor_id uuid)
 RETURNS TABLE(feature_key text, label text, description text, default_min_tier text, included_by_plan boolean, override_enabled boolean, override_granted_by uuid, override_granted_at timestamp with time zone, override_reason text, override_expires_at timestamp with time zone, override_active boolean, effective_enabled boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS DISTINCT FROM _doctor_id
     AND public.staff_doctor_id(auth.uid()) IS DISTINCT FROM _doctor_id
     AND NOT public.sa_has_any_permission(auth.uid(), ARRAY['doctors.view', 'flags.view']) THEN
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
$function$;

-- ============================================
-- ADDITIVE TEAM POLICIES (owner policies are left untouched)
-- ============================================
-- Audit log: any active member may write their own entries; reading needs audit.view.
CREATE POLICY "Team can insert audit log" ON public.admin_audit_log
  FOR INSERT WITH CHECK (public.is_active_team_member(auth.uid()) AND admin_user_id = auth.uid());
CREATE POLICY "Team can view audit log" ON public.admin_audit_log
  FOR SELECT USING (public.sa_has_permission(auth.uid(), 'audit.view'));

-- Patient data (PHI): separate, explicit permission. payments.view also reads
-- appointments because the Payments page joins them.
CREATE POLICY "Team can view appointments" ON public.appointments
  FOR SELECT USING (public.sa_has_any_permission(auth.uid(), ARRAY['phi.view', 'payments.view']));
CREATE POLICY "Team can view patients" ON public.patients
  FOR SELECT USING (public.sa_has_permission(auth.uid(), 'phi.view'));

-- Moderation
CREATE POLICY "Team can view blog_posts" ON public.blog_posts
  FOR SELECT USING (public.sa_has_permission(auth.uid(), 'moderation.view'));
CREATE POLICY "Team can update blog_posts" ON public.blog_posts
  FOR UPDATE USING (public.sa_has_permission(auth.uid(), 'moderation.manage'))
  WITH CHECK (public.sa_has_permission(auth.uid(), 'moderation.manage'));
CREATE POLICY "Team can view reviews" ON public.reviews
  FOR SELECT USING (public.sa_has_permission(auth.uid(), 'moderation.view'));
CREATE POLICY "Team can update reviews" ON public.reviews
  FOR UPDATE USING (public.sa_has_permission(auth.uid(), 'moderation.manage'))
  WITH CHECK (public.sa_has_permission(auth.uid(), 'moderation.manage'));

-- Payments & payouts (bank details only via payments.view)
CREATE POLICY "Team can view payments" ON public.payments
  FOR SELECT USING (public.sa_has_permission(auth.uid(), 'payments.view'));
CREATE POLICY "Team can view transfers" ON public.transfers
  FOR SELECT USING (public.sa_has_permission(auth.uid(), 'payments.view'));
CREATE POLICY "Team can view doctor_ledger" ON public.doctor_ledger
  FOR SELECT USING (public.sa_has_permission(auth.uid(), 'payments.view'));
CREATE POLICY "Team can view settlements" ON public.settlements
  FOR SELECT USING (public.sa_has_permission(auth.uid(), 'payments.view'));
CREATE POLICY "Team can view bank accounts" ON public.doctor_bank_accounts
  FOR SELECT USING (public.sa_has_permission(auth.uid(), 'payments.view'));
CREATE POLICY "Team can view webhook events" ON public.webhook_events
  FOR SELECT USING (public.sa_has_permission(auth.uid(), 'payments.view'));
CREATE POLICY "Team can view payouts" ON public.payouts
  FOR SELECT USING (public.sa_has_permission(auth.uid(), 'payments.view'));
CREATE POLICY "Team can manage payouts" ON public.payouts
  FOR ALL USING (public.sa_has_permission(auth.uid(), 'payments.payout'))
  WITH CHECK (public.sa_has_permission(auth.uid(), 'payments.payout'));

-- Doctors (profile + website content shown on doctor detail)
CREATE POLICY "Team can view profiles" ON public.profiles
  FOR SELECT USING (public.is_active_team_member(auth.uid()));
CREATE POLICY "Team can update profiles" ON public.profiles
  FOR UPDATE USING (public.sa_has_any_permission(auth.uid(), ARRAY['doctors.edit', 'subscriptions.manage']))
  WITH CHECK (public.sa_has_any_permission(auth.uid(), ARRAY['doctors.edit', 'subscriptions.manage']));
CREATE POLICY "Team can view services" ON public.services
  FOR SELECT USING (public.sa_has_permission(auth.uid(), 'doctors.view'));
CREATE POLICY "Team can view packages" ON public.packages
  FOR SELECT USING (public.sa_has_permission(auth.uid(), 'doctors.view'));
CREATE POLICY "Team can view gallery_photos" ON public.gallery_photos
  FOR SELECT USING (public.sa_has_permission(auth.uid(), 'doctors.view'));
CREATE POLICY "Team can view website_settings" ON public.website_settings
  FOR SELECT USING (public.sa_has_permission(auth.uid(), 'doctors.view'));

-- Billing / subscriptions
CREATE POLICY "Team can view invoices" ON public.invoices
  FOR SELECT USING (public.sa_has_any_permission(auth.uid(), ARRAY['billing.view', 'doctors.view', 'overview.view']));
CREATE POLICY "Team can view plan payments" ON public.plan_upgrade_payments
  FOR SELECT USING (public.sa_has_any_permission(auth.uid(), ARRAY['billing.view', 'subscriptions.view']));

-- Leads
CREATE POLICY "Team can view enquiries" ON public.enquiries
  FOR SELECT USING (public.sa_has_permission(auth.uid(), 'leads.view'));
CREATE POLICY "Team can update enquiries" ON public.enquiries
  FOR UPDATE USING (public.sa_has_permission(auth.uid(), 'leads.manage'))
  WITH CHECK (public.sa_has_permission(auth.uid(), 'leads.manage'));

-- Support tickets
CREATE POLICY "Team can view tickets" ON public.support_tickets
  FOR SELECT USING (public.sa_has_permission(auth.uid(), 'tickets.view'));
CREATE POLICY "Team can update tickets" ON public.support_tickets
  FOR UPDATE USING (public.sa_has_permission(auth.uid(), 'tickets.reply'))
  WITH CHECK (public.sa_has_permission(auth.uid(), 'tickets.reply'));
CREATE POLICY "Team can delete tickets" ON public.support_tickets
  FOR DELETE USING (public.sa_has_permission(auth.uid(), 'tickets.delete'));

-- Feature flags / platform settings / per-doctor overrides
CREATE POLICY "Team can view features" ON public.features
  FOR SELECT USING (public.sa_has_permission(auth.uid(), 'flags.view'));
CREATE POLICY "Team can manage features" ON public.features
  FOR ALL USING (public.sa_has_permission(auth.uid(), 'flags.manage'))
  WITH CHECK (public.sa_has_permission(auth.uid(), 'flags.manage'));
CREATE POLICY "Team can view platform_settings" ON public.platform_settings
  FOR SELECT USING (public.sa_has_any_permission(auth.uid(), ARRAY['flags.view', 'doctors.view', 'billing.view']));
CREATE POLICY "Team can manage platform_settings" ON public.platform_settings
  FOR ALL USING (public.sa_has_permission(auth.uid(), 'flags.manage'))
  WITH CHECK (public.sa_has_permission(auth.uid(), 'flags.manage'));
CREATE POLICY "Team can view feature overrides" ON public.doctor_feature_overrides
  FOR SELECT USING (public.sa_has_any_permission(auth.uid(), ARRAY['flags.view', 'doctors.view']));
CREATE POLICY "Team can manage feature overrides" ON public.doctor_feature_overrides
  FOR ALL USING (public.sa_has_any_permission(auth.uid(), ARRAY['flags.manage', 'doctors.edit']))
  WITH CHECK (public.sa_has_any_permission(auth.uid(), ARRAY['flags.manage', 'doctors.edit']));

-- Notifications
CREATE POLICY "Team can view notification logs" ON public.notification_logs
  FOR SELECT USING (public.sa_has_permission(auth.uid(), 'notifications.view'));
CREATE POLICY "Team can manage notifications" ON public.notifications
  FOR ALL USING (public.sa_has_any_permission(auth.uid(), ARRAY['notifications.manage', 'tickets.reply']))
  WITH CHECK (public.sa_has_any_permission(auth.uid(), ARRAY['notifications.manage', 'tickets.reply']));
