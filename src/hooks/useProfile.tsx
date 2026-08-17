import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
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
export type ProfileState = {
  profile: Tables<"profiles"> | null;
  loading: boolean;
  setProfile: (p: Tables<"profiles"> | null) => void;
  refetch: () => Promise<void>;
  isStaff: boolean;
  staffPermissions: Permissions;
  staffName: string | null;
  can: (key: PermissionKey) => boolean;
};

// The actual fetch + local state, shared by both the context provider below
// and the standalone fallback. `enabled=false` skips the fetch entirely
// (used when a ProfileContext higher up the tree already owns it) — hooks
// must still be called unconditionally, so the skip happens inside the
// effect, not by conditionally calling this hook.
function useProfileState(enabled: boolean): ProfileState {
  const [profile, setProfile] = useState<Tables<"profiles"> | null>(null);
  const [loading, setLoading] = useState(enabled);
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
    if (!enabled) return;
    fetchProfile();
  }, [enabled, fetchProfile]);

  // Doctors always pass every check — the permission system exists
  // exclusively to restrict staff, never the doctor's own account.
  const can = useCallback((key: PermissionKey) => !isStaff || staffPermissions[key] === true, [isStaff, staffPermissions]);

  return { profile, loading, setProfile, refetch: fetchProfile, isStaff, staffPermissions, staffName, can };
}

const ProfileContext = createContext<ProfileState | null>(null);

// Wrap a subtree (the whole /admin/* app — see AdminDashboard.tsx) in this
// ONCE so every component under it (sidebar, route guards, individual
// pages) reads the exact same isStaff/permissions snapshot from a single
// fetch, instead of each of the ~15 call sites independently re-fetching on
// its own mount. That per-component fetching was the root cause of staff
// sometimes appearing to have the wrong access: e.g. the sidebar's own
// independent fetch hadn't resolved yet (isStaff still false on its first
// render) while a page's PermissionGate had already resolved correctly, so
// the sidebar would briefly list links the staff member didn't actually
// have — cosmetic, but exactly the "sees access that wasn't granted"
// symptom, and it came from state fragmentation, not the underlying data.
export const ProfileProvider = ({ children }: { children: ReactNode }) => {
  const state = useProfileState(true);
  return <ProfileContext.Provider value={state}>{children}</ProfileContext.Provider>;
};

// Reads the shared ProfileContext when available. Falls back to its own
// standalone fetch when used outside a ProfileProvider (e.g.
// UpgradeCheckoutDialog rendered from ProtectedRoute's suspended-account
// wall, which appears before the /admin/* tree — and its ProfileProvider —
// ever mounts), so behavior there is unchanged.
export const useProfile = (): ProfileState => {
  const ctx = useContext(ProfileContext);
  const standalone = useProfileState(!ctx);
  return ctx ?? standalone;
};
