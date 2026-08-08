import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { Permissions, PermissionKey } from "@/lib/staffPermissions";

// Staff-aware: a logged-in staff member has no profiles row of their own
// (handle_new_user() deliberately skips creating one for them — see the
// staff_management_core migration), so this hook resolves `profile` to the
// ASSIGNED DOCTOR's own profile row instead. That keeps `profile.id` equal
// to the doctor's id for both actors, so every existing page's
// `.eq("doctor_id", profile.id)` query pattern keeps working unchanged for
// staff too — each table's own RLS policy is what actually decides whether
// the staff member can read/write those specific rows.
//
// If the staff member wasn't granted "View Profile", the doctor-profile
// fetch itself is blocked by RLS; `profile` then falls back to a minimal
// stub carrying only `id` so `doctor_id` lookups elsewhere keep working,
// while richer personal fields simply come through empty (the whole point
// of gating "View Profile" is exactly to hide those, not other modules).
export const useProfile = () => {
  const [profile, setProfile] = useState<Tables<"profiles"> | null>(null);
  const [loading, setLoading] = useState(true);
  const [isStaff, setIsStaff] = useState(false);
  const [staffPermissions, setStaffPermissions] = useState<Permissions>({});
  const [staffName, setStaffName] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: ownProfile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (ownProfile) {
      setProfile(ownProfile);
      setIsStaff(false);
      setStaffPermissions({});
      setStaffName(null);
      setLoading(false);
      return;
    }

    const { data: staffRow } = await supabase
      .from("staff_members")
      .select("doctor_id, staff_name, permissions, status")
      .eq("id", user.id)
      .maybeSingle();

    if (staffRow && staffRow.status === "active") {
      setIsStaff(true);
      setStaffPermissions((staffRow.permissions as Permissions) || {});
      setStaffName(staffRow.staff_name);
      const { data: doctorProfile } = await supabase.from("profiles").select("*").eq("id", staffRow.doctor_id).maybeSingle();
      setProfile(doctorProfile ?? ({ id: staffRow.doctor_id } as Tables<"profiles">));
    } else {
      setProfile(null);
      setIsStaff(false);
      setStaffPermissions({});
      setStaffName(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Doctors always pass every check — the permission system exists
  // exclusively to restrict staff, never the doctor's own account.
  const can = useCallback((key: PermissionKey) => !isStaff || staffPermissions[key] === true, [isStaff, staffPermissions]);

  return { profile, loading, setProfile, refetch: fetchProfile, isStaff, staffPermissions, staffName, can };
};
