// Canonical superadmin Team permission keys — must mirror
// src/lib/superadminPermissions.ts and the sa_* policies in the
// superadmin_team migration exactly (duplicated, not imported: edge functions
// run on Deno and cannot import from src/).
import { createClient } from "npm:@supabase/supabase-js@2";

export const SA_PERMISSION_KEYS = [
  "overview.view",
  "doctors.view",
  "doctors.edit",
  "doctors.delete",
  "leads.view",
  "leads.manage",
  "subscriptions.view",
  "subscriptions.manage",
  "payments.view",
  "payments.refund",
  "payments.payout",
  "tickets.view",
  "tickets.reply",
  "tickets.delete",
  "moderation.view",
  "moderation.manage",
  "billing.view",
  "flags.view",
  "flags.manage",
  "audit.view",
  "notifications.view",
  "notifications.manage",
  "phi.view",
] as const;

const KEY_SET = new Set<string>(SA_PERMISSION_KEYS);

// Strips unknown keys and coerces every recognized key to a strict boolean.
export function sanitizeSaPermissions(input: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (!input || typeof input !== "object") return out;
  for (const key of Object.keys(input as Record<string, unknown>)) {
    if (KEY_SET.has(key)) out[key] = (input as Record<string, unknown>)[key] === true;
  }
  return out;
}

// True for owners (user_roles 'admin') and for active Team members holding
// `permission`. Backed by public.sa_has_permission, which includes the owner
// check, so edge functions and RLS policies share one definition.
export async function hasSuperadminPermission(
  admin: ReturnType<typeof createClient>,
  userId: string,
  permission: string,
): Promise<boolean> {
  const { data } = await admin.rpc("sa_has_permission", { _user_id: userId, _permission: permission });
  return data === true;
}
