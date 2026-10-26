// Route-level enforcement for the superadmin console: hiding sidebar items
// isn't enough, a Team member typing a restricted /superadmin/* URL must be
// blocked too. UI-layer defense-in-depth; the real backstop is each table's RLS
// policy and the edge functions' permission checks.
import { ShieldAlert } from "lucide-react";
import { useSuperAdminAccess } from "@/contexts/SuperAdminAccessContext";
import type { SAPermissionKey } from "@/lib/superadminPermissions";

// `permission === null` means owner-only (e.g. the Team page itself).
const SAPermissionGate = ({ permission, children }: { permission: SAPermissionKey | null; children: React.ReactNode }) => {
  const { isOwner, can } = useSuperAdminAccess();

  if (isOwner || (permission !== null && can(permission))) return <>{children}</>;

  return (
    <div className="max-w-md mx-auto text-center py-24">
      <ShieldAlert className="h-10 w-10 text-destructive/60 mx-auto mb-3" />
      <h1 className="font-heading font-bold text-lg text-primary mb-1">Access Denied</h1>
      <p className="text-sm text-muted-foreground">You don't have permission to view this section. Ask an owner to request access.</p>
    </div>
  );
};

export default SAPermissionGate;
