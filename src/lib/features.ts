// Canonical feature keys — must match the `key` column of the `features`
// table (see supabase/migrations/20260820150000_feature_entitlement_overrides.sql).
// Every plan-gated surface should reference one of these constants instead of
// a hardcoded string, so a typo can't silently create an unrecognized key.
export const FEATURE_KEYS = {
  ONLINE_CONSULTATION: "online_consultation",
  AI_BLOG_WRITER: "ai_blog_writer",
  BILLING_INVOICES: "billing_invoices",
  PATIENT_RECORDS: "patient_records",
  STAFF_MANAGEMENT: "staff_management",
} as const;

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS];
