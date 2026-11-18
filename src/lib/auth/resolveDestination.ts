import { supabase } from "@/integrations/supabase/client";

export type Destination = { to: string } | { error: string };

// One place that decides where a freshly authenticated user belongs, since
// owners, superadmin Team members, doctor-owned clinic staff and doctors all
// sign in through the same phone + OTP form:
//   owner (user_roles 'admin')        -> /superadmin
//   active Team member                -> /superadmin   (inactive -> error)
//   active clinic staff               -> /admin/dashboard (inactive -> error)
//   doctor                            -> /admin/dashboard, or /onboarding if unfinished
// `onboarding: true` marks a fresh login (records last_login_at and checks
// doctor onboarding); `false` is used when an existing session is merely being
// redirected away from the login page.
export async function resolvePostLoginDestination(
  userId: string,
  { onboarding }: { onboarding: boolean },
): Promise<Destination> {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (isAdmin) return { to: "/superadmin" };

  const { data: member } = await supabase
    .from("superadmin_team_members")
    .select("status")
    .eq("id", userId)
    .maybeSingle();
  if (member) {
    if (member.status !== "active") {
      return { error: "Your team account is inactive. Please contact an owner." };
    }
    if (onboarding) await supabase.rpc("touch_team_login");
    return { to: "/superadmin" };
  }

  const { data: staffRow } = await supabase
    .from("staff_members")
    .select("status")
    .eq("id", userId)
    .maybeSingle();
  if (staffRow) {
    if (staffRow.status !== "active") {
      return { error: "Your staff account is inactive. Please contact your clinic." };
    }
    if (onboarding) await supabase.rpc("touch_staff_login");
    return { to: "/admin/dashboard" };
  }

  if (!onboarding) return { to: "/admin/dashboard" };
  const { data: profile } = await supabase.from("profiles").select("onboarding_completed").single();
  return { to: profile?.onboarding_completed ? "/admin/dashboard" : "/onboarding" };
}
