import { createContext, useContext } from "react";
import type { SAPermissionKey, SAPermissions } from "@/lib/superadminPermissions";

// Who is inside the superadmin console: an owner (user_roles 'admin', holds
// every permission) or a Team member (holds exactly their stored flags).
// Provided by SuperAdminRoute once access is verified. The UI uses this only
// for hiding/blocking; the real enforcement is RLS + edge-function checks.
export type SuperAdminAccess = {
  isOwner: boolean;
  permissions: SAPermissions;
  can: (key: SAPermissionKey) => boolean;
};

const SuperAdminAccessContext = createContext<SuperAdminAccess>({
  isOwner: false,
  permissions: {},
  can: () => false,
});

export const SuperAdminAccessProvider = SuperAdminAccessContext.Provider;

export const useSuperAdminAccess = () => useContext(SuperAdminAccessContext);

export const buildSuperAdminAccess = (isOwner: boolean, permissions: SAPermissions): SuperAdminAccess => ({
  isOwner,
  permissions,
  can: (key) => isOwner || permissions[key] === true,
});
