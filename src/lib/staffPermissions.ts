// Canonical staff permission keys — must mirror
// supabase/functions/_shared/staffPermissions.ts exactly (duplicated, not
// imported: edge functions run on Deno and can't import from src/).
export type PermissionKey =
  | "dashboard.view"
  | "website.view" | "website.edit" | "website.settings"
  | "appointments.view" | "appointments.create" | "appointments.edit" | "appointments.cancel"
  | "patients.view" | "patients.add" | "patients.edit" | "patients.medical_records"
  | "prescriptions.view" | "prescriptions.create" | "prescriptions.edit"
  | "reviews.view" | "reviews.manage"
  | "blog.view" | "blog.create" | "blog.edit" | "blog.delete"
  | "billing.view" | "billing.manage"
  | "profile.view" | "profile.edit"
  | "staff.view" | "staff.create" | "staff.edit" | "staff.disable"
  | "inquiries.view" | "inquiries.manage";

export type Permissions = Partial<Record<PermissionKey, boolean>>;

export type PermissionModule = {
  key: string;
  label: string;
  permissions: { key: PermissionKey; label: string }[];
};

export const PERMISSION_MODULES: PermissionModule[] = [
  { key: "dashboard", label: "Dashboard", permissions: [
    { key: "dashboard.view", label: "View Dashboard" },
  ]},
  { key: "website", label: "My Website", permissions: [
    { key: "website.view", label: "View My Website" },
    { key: "website.edit", label: "Edit Website" },
    { key: "website.settings", label: "Website Settings" },
  ]},
  { key: "appointments", label: "Appointments", permissions: [
    { key: "appointments.view", label: "View Appointments" },
    { key: "appointments.create", label: "Create Appointment" },
    { key: "appointments.edit", label: "Edit Appointment" },
    { key: "appointments.cancel", label: "Cancel Appointment" },
  ]},
  { key: "patients", label: "Patients", permissions: [
    { key: "patients.view", label: "View Patients" },
    { key: "patients.add", label: "Add Patient" },
    { key: "patients.edit", label: "Edit Patient" },
    { key: "patients.medical_records", label: "View Patient Medical Records" },
  ]},
  { key: "prescriptions", label: "Prescriptions", permissions: [
    { key: "prescriptions.view", label: "View Prescriptions" },
    { key: "prescriptions.create", label: "Create Prescription" },
    { key: "prescriptions.edit", label: "Edit Prescription" },
  ]},
  { key: "reviews", label: "Reviews", permissions: [
    { key: "reviews.view", label: "View Reviews" },
    { key: "reviews.manage", label: "Manage Reviews" },
  ]},
  { key: "blog", label: "Blog", permissions: [
    { key: "blog.view", label: "View Blog" },
    { key: "blog.create", label: "Create Blog" },
    { key: "blog.edit", label: "Edit Blog" },
    { key: "blog.delete", label: "Delete Blog" },
  ]},
  { key: "billing", label: "Billing", permissions: [
    { key: "billing.view", label: "View Billing" },
    { key: "billing.manage", label: "Manage Billing" },
  ]},
  { key: "profile", label: "Profile", permissions: [
    { key: "profile.view", label: "View Profile" },
    { key: "profile.edit", label: "Edit Profile" },
  ]},
  { key: "staff", label: "Staff Management", permissions: [
    { key: "staff.view", label: "View Staff" },
    { key: "staff.create", label: "Create Staff" },
    { key: "staff.edit", label: "Edit Staff" },
    { key: "staff.disable", label: "Disable Staff" },
  ]},
  { key: "inquiries", label: "Inquiries", permissions: [
    { key: "inquiries.view", label: "View Inquiries" },
    { key: "inquiries.manage", label: "Manage Inquiries" },
  ]},
];

// Route (pathname prefix) → permission required to enter it. Checked at both
// the sidebar (hide) and route (block + redirect) level. "/admin/settings"
// is gated on profile.view since Profile now lives there as a tab — a staff
// member who could view their profile at the old /admin/profile route needs
// the same access at its new home (SettingsPage.tsx renders only the
// Profile tab, with no Subscription/Account tabs, when isStaff is true).
export const ROUTE_PERMISSIONS: { prefix: string; permission: PermissionKey }[] = [
  { prefix: "/admin/dashboard", permission: "dashboard.view" },
  { prefix: "/admin/my-website", permission: "website.view" },
  { prefix: "/admin/appointments", permission: "appointments.view" },
  { prefix: "/admin/patients", permission: "patients.view" },
  { prefix: "/admin/prescriptions", permission: "prescriptions.view" },
  { prefix: "/admin/reviews", permission: "reviews.view" },
  { prefix: "/admin/blog", permission: "blog.view" },
  { prefix: "/admin/billing", permission: "billing.view" },
  { prefix: "/admin/settings", permission: "profile.view" },
  { prefix: "/admin/staff", permission: "staff.view" },
  { prefix: "/admin/inquiries", permission: "inquiries.view" },
];

export const permissionForPath = (pathname: string): PermissionKey | null => {
  const match = ROUTE_PERMISSIONS.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));
  return match?.permission ?? null;
};
