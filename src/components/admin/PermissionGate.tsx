// Route-level enforcement (spec section 8): hiding sidebar items isn't
// enough — a staff member typing a restricted /admin/* URL directly must be
// blocked here too. This is UI-layer defense-in-depth; the real backstop is
// each table's own RLS policy (see the staff_permission_policies migration),
// which still applies even if this component were somehow bypassed.
import { useProfile } from "@/hooks/useProfile";
import type { PermissionKey } from "@/lib/staffPermissions";
import { ShieldAlert, Loader2 } from "lucide-react";

const PermissionGate = ({ permission, children }: { permission: PermissionKey | null; children: React.ReactNode }) => {
  const { isStaff, can, loading } = useProfile();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-7 w-7 animate-spin text-royal" />
      </div>
    );
  }

  if (!isStaff) return <>{children}</>;

  // No permission entry (e.g. Settings) means the page has no checkbox at
  // all in the staff system, so it's doctor-only, full stop.
  if (permission === null || !can(permission)) {
    return (
      <div className="max-w-md mx-auto text-center py-24">
        <ShieldAlert className="h-10 w-10 text-destructive/60 mx-auto mb-3" />
        <h1 className="font-heading font-bold text-lg text-primary mb-1">Access Denied</h1>
        <p className="text-sm text-muted-foreground">You don't have permission to view this section. Contact your doctor to request access.</p>
      </div>
    );
  }

  return <>{children}</>;
};

export default PermissionGate;
