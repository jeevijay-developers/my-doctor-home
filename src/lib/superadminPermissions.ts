// Canonical superadmin Team permission keys — must mirror
// supabase/functions/_shared/superadminPermissions.ts and the sa_* policies in
// the superadmin_team migration exactly (duplicated, not imported: edge
// functions run on Deno and can't import from src/).
//
// Owners (user_roles 'admin') implicitly hold every permission and are never
// restricted. Team management itself (/superadmin/team) has no key on purpose:
// it is owner-only so a team member can never grant themselves more access.
export type SAPermissionKey =
  | "overview.view"
  | "doctors.view" | "doctors.edit" | "doctors.delete"
  | "leads.view" | "leads.manage"
  | "subscriptions.view" | "subscriptions.manage"
  | "plan_requests.view" | "plan_requests.manage"
  | "payments.view" | "payments.refund" | "payments.payout"
  | "tickets.view" | "tickets.reply" | "tickets.delete"
  | "moderation.view" | "moderation.manage"
  | "billing.view"
  | "flags.view" | "flags.manage"
  | "audit.view"
  | "notifications.view" | "notifications.manage"
  | "phi.view";

export type SAPermissions = Partial<Record<SAPermissionKey, boolean>>;

export type SAPermissionModule = {
  key: string;
  label: string;
  permissions: { key: SAPermissionKey; label: string }[];
};

export const SA_PERMISSION_MODULES: SAPermissionModule[] = [
  { key: "overview", label: "Overview", permissions: [
    { key: "overview.view", label: "View Overview" },
  ]},
  { key: "doctors", label: "Doctors", permissions: [
    { key: "doctors.view", label: "View Doctors" },
    { key: "doctors.edit", label: "Edit Doctors" },
    { key: "doctors.delete", label: "Delete Doctors" },
  ]},
  { key: "leads", label: "Leads", permissions: [
    { key: "leads.view", label: "View Leads" },
    { key: "leads.manage", label: "Manage Leads" },
  ]},
  { key: "subscriptions", label: "Subscriptions", permissions: [
    { key: "subscriptions.view", label: "View Subscriptions" },
    { key: "subscriptions.manage", label: "Manage Subscriptions" },
  ]},
  { key: "plan_requests", label: "Plan Requests", permissions: [
    { key: "plan_requests.view", label: "View Plan Requests" },
    { key: "plan_requests.manage", label: "Approve / Reject Plan Requests" },
  ]},
  { key: "payments", label: "Payments & Payouts", permissions: [
    { key: "payments.view", label: "View Payments & Payouts" },
    { key: "payments.refund", label: "Issue Refunds" },
    { key: "payments.payout", label: "Create Payouts" },
  ]},
  { key: "tickets", label: "Support Tickets", permissions: [
    { key: "tickets.view", label: "View Tickets" },
    { key: "tickets.reply", label: "Reply to / Update Tickets" },
    { key: "tickets.delete", label: "Delete Tickets" },
  ]},
  { key: "moderation", label: "Moderation", permissions: [
    { key: "moderation.view", label: "View Blogs & Reviews" },
    { key: "moderation.manage", label: "Approve / Reject Content" },
  ]},
  { key: "billing", label: "Billing", permissions: [
    { key: "billing.view", label: "View Billing" },
  ]},
  { key: "flags", label: "Feature Flags", permissions: [
    { key: "flags.view", label: "View Feature Flags" },
    { key: "flags.manage", label: "Manage Feature Flags" },
  ]},
  { key: "audit", label: "Audit Log", permissions: [
    { key: "audit.view", label: "View Audit Log" },
  ]},
  { key: "notifications", label: "Notification Testing", permissions: [
    { key: "notifications.view", label: "View Notification Logs" },
    { key: "notifications.manage", label: "Send Test Notifications" },
  ]},
  { key: "phi", label: "Patient Data (sensitive)", permissions: [
    { key: "phi.view", label: "View patients & appointments across doctors" },
  ]},
];

export const ALL_SA_PERMISSION_KEYS: SAPermissionKey[] = SA_PERMISSION_MODULES.flatMap((m) => m.permissions.map((p) => p.key));

// Quick-start sets for the Team form; the checkboxes stay fully editable.
export const SA_PERMISSION_PRESETS: { label: string; permissions: SAPermissionKey[] }[] = [
  { label: "Support", permissions: ["overview.view", "doctors.view", "tickets.view", "tickets.reply", "leads.view"] },
  { label: "Finance", permissions: ["overview.view", "doctors.view", "payments.view", "payments.refund", "payments.payout", "billing.view", "subscriptions.view", "plan_requests.view"] },
  { label: "Sales", permissions: ["overview.view", "doctors.view", "leads.view", "leads.manage", "subscriptions.view", "subscriptions.manage", "plan_requests.view", "plan_requests.manage"] },
  { label: "Content Moderator", permissions: ["moderation.view", "moderation.manage"] },
];

// Sidebar/route → the permission needed to open it. `null` = owner only.
export const SA_ROUTE_PERMISSIONS: { prefix: string; permission: SAPermissionKey | null }[] = [
  { prefix: "/superadmin/overview", permission: "overview.view" },
  { prefix: "/superadmin/doctors", permission: "doctors.view" },
  { prefix: "/superadmin/leads", permission: "leads.view" },
  { prefix: "/superadmin/subscriptions", permission: "subscriptions.view" },
  { prefix: "/superadmin/plan-requests", permission: "plan_requests.view" },
  { prefix: "/superadmin/payments", permission: "payments.view" },
  { prefix: "/superadmin/tickets", permission: "tickets.view" },
  { prefix: "/superadmin/moderation", permission: "moderation.view" },
  { prefix: "/superadmin/billing", permission: "billing.view" },
  { prefix: "/superadmin/flags", permission: "flags.view" },
  { prefix: "/superadmin/audit-log", permission: "audit.view" },
  { prefix: "/superadmin/notifications", permission: "notifications.view" },
  { prefix: "/superadmin/team", permission: null },
];
