-- ============================================
-- STAFF MANAGEMENT — CORE (RBAC for doctor-owned clinic staff)
-- ============================================
-- Staff are real Supabase Auth users (auth.users), created via the
-- create-staff-account edge function with a synthetic, never-shown email
-- (login is by username, not email) and a Supabase-Auth-hashed password —
-- this reuses Supabase's own battle-tested password hashing + session/JWT
-- machinery instead of hand-rolling crypto in an edge function.
--
-- IMPORTANT: 'staff' already exists as a public.app_role enum value, but it
-- is used exclusively by the SUPERADMIN's own internal team console
-- (supabase/functions/invite-team-member + src/components/superadmin/SATeam.tsx,
-- which lists every user_roles row with role IN ('admin','staff')). Doctor-
-- owned clinic staff are a completely different concept (per-doctor tenants,
-- granular per-module permissions) and must NOT be recorded in user_roles
-- with role='staff', or every doctor's clinic staff would incorrectly show
-- up in the superadmin's platform team list. Doctor-owned staff membership
-- is tracked ONLY by a row existing in public.staff_members — no user_roles
-- entry is created for them at all.
--
-- Username uniqueness is GLOBAL (not per-doctor): the staff login page only
-- collects a username + password with no doctor context, so the login must
-- be resolvable to exactly one account platform-wide.

-- ============================================
-- TABLE
-- ============================================
CREATE TABLE public.staff_members (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  staff_name text NOT NULL,
  username text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  last_login_at timestamptz
);

CREATE UNIQUE INDEX idx_staff_members_username ON public.staff_members (lower(username));
CREATE INDEX idx_staff_members_doctor ON public.staff_members(doctor_id);

CREATE TRIGGER update_staff_members_updated_at BEFORE UPDATE ON public.staff_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- HELPER FUNCTIONS (used throughout every staff RLS policy in this and the
-- following migration)
-- ============================================

-- The doctor_id a given auth user acts on behalf of as staff, or NULL if
-- they are not an active staff member of anyone. STABLE + SECURITY DEFINER
-- so it can be safely evaluated inside RLS policies on other tables without
-- those tables needing their own SELECT grant on staff_members.
CREATE OR REPLACE FUNCTION public.staff_doctor_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT doctor_id FROM public.staff_members WHERE id = _user_id AND status = 'active'
$$;

-- Whether an active staff member has a specific permission flag set true.
-- Permission keys are flat dot-separated strings matching the doctor-facing
-- checkbox list exactly (e.g. 'patients.edit') — see src/lib/staffPermissions.ts.
CREATE OR REPLACE FUNCTION public.staff_has_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((permissions ->> _permission)::boolean, false)
  FROM public.staff_members WHERE id = _user_id AND status = 'active'
$$;

GRANT EXECUTE ON FUNCTION public.staff_doctor_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_has_permission(uuid, text) TO authenticated;

-- ============================================
-- Skip the normal doctor bootstrap for staff accounts
-- ============================================
-- create-staff-account tags the new auth user with
-- raw_user_meta_data->>'account_type' = 'staff' precisely so this trigger
-- can tell them apart from a real doctor signup and avoid creating an
-- unwanted profiles row / 'doctor' user_roles row for them.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.raw_user_meta_data->>'account_type' = 'staff' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'doctor');

  RETURN NEW;
END;
$$;

-- ============================================
-- staff_members RLS
-- ============================================
ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;

-- The owning doctor has full, unrestricted control over their own staff —
-- this is a doctor's OWN data, entirely separate from the permission system
-- staff themselves are subject to. The doctor is never restricted here.
CREATE POLICY "Doctors manage own staff" ON public.staff_members
  FOR ALL USING (auth.uid() = doctor_id) WITH CHECK (auth.uid() = doctor_id);

-- Every staff member can always read their OWN row (needed to load their own
-- name/permissions on login), regardless of any permission flag.
CREATE POLICY "Staff can view own record" ON public.staff_members
  FOR SELECT USING (auth.uid() = id);

-- Viewing the rest of the doctor's staff roster requires staff.view.
CREATE POLICY "Staff can view co-staff with permission" ON public.staff_members
  FOR SELECT USING (
    public.staff_doctor_id(auth.uid()) = doctor_id
    AND public.staff_has_permission(auth.uid(), 'staff.view')
  );

-- Creating a new staff account requires staff.create, and can only ever
-- target the caller's own doctor (never another tenant).
CREATE POLICY "Staff can create co-staff with permission" ON public.staff_members
  FOR INSERT WITH CHECK (
    public.staff_doctor_id(auth.uid()) = doctor_id
    AND public.staff_has_permission(auth.uid(), 'staff.create')
  );

-- Updating another staff member (never self — see trigger below, which is
-- the real enforcement backstop) requires staff.edit or staff.disable.
-- The trigger below decides which one is actually required for the specific
-- fields being changed.
CREATE POLICY "Staff can update co-staff with permission" ON public.staff_members
  FOR UPDATE USING (
    public.staff_doctor_id(auth.uid()) = doctor_id
    AND id <> auth.uid()
    AND (
      public.staff_has_permission(auth.uid(), 'staff.edit')
      OR public.staff_has_permission(auth.uid(), 'staff.disable')
    )
  ) WITH CHECK (
    public.staff_doctor_id(auth.uid()) = doctor_id
  );

-- No staff DELETE policy: the doctor-facing permission checkboxes for Staff
-- Management only ever offer view/create/edit/disable — there is no
-- "Delete Staff" checkbox to grant, so staff can never delete a staff
-- account under any permission combination. Only the doctor's own
-- "Doctors manage own staff" FOR ALL policy allows deletion.

-- Fine-grained enforcement that a single boolean permission pair can't
-- express: editing name/username/permissions/doctor_id requires staff.edit,
-- but changing ONLY status (activate/deactivate) requires staff.disable.
-- This also means staff.disable alone can never be used to rename another
-- staff member or change their permissions.
CREATE OR REPLACE FUNCTION public.enforce_staff_member_update_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.staff_doctor_id(auth.uid()) IS NOT NULL THEN
    IF NEW.staff_name IS DISTINCT FROM OLD.staff_name
       OR NEW.username IS DISTINCT FROM OLD.username
       OR NEW.permissions IS DISTINCT FROM OLD.permissions
       OR NEW.doctor_id IS DISTINCT FROM OLD.doctor_id THEN
      IF NOT public.staff_has_permission(auth.uid(), 'staff.edit') THEN
        RAISE EXCEPTION 'Not authorized to edit staff';
      END IF;
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT public.staff_has_permission(auth.uid(), 'staff.disable') THEN
        RAISE EXCEPTION 'Not authorized to change staff status';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_staff_member_update
  BEFORE UPDATE ON public.staff_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_staff_member_update_permission();
