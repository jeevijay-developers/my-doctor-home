// Social Media Marketing add-on of a custom plan. Mirrors public.custom_plan_social_marketing
// (migration 20261127180000_social_marketing_addon.sql). The company team delivers this service;
// the app only records the agreed scope and refuses to call it Active until it is fully documented.
// missingForActivation() mirrors public.social_marketing_missing() - keep the two in step.

export type SocialMarketingStatus = "draft" | "active" | "ended";
export type PublishingBy = "company" | "clinic";
export type ReportingFrequency = "weekly" | "fortnightly" | "monthly" | "quarterly";
export type ApprovalProcess = "each_post" | "monthly_calendar";

export type SocialMarketing = {
  doctor_id?: string;
  status?: SocialMarketingStatus;
  platforms: string[];
  posts_per_month: number | null;
  post_types: string[];
  creative_included: boolean;
  calendar_included: boolean;
  publishing_by: PublishingBy | null;
  community_management: boolean;
  paid_ads: boolean;
  ad_spend_monthly: number | null;
  reporting_frequency: ReportingFrequency | null;
  monthly_fee: number | null;
  approval_process: ApprovalProcess | null;
  notes: string | null;
  access_confirmed: boolean;
  agreed: boolean;
  agreed_on: string | null;
  agreement_ref: string | null;
};

export const SM_PLATFORMS = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "youtube", label: "YouTube" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "x", label: "X (Twitter)" },
  { value: "google_business", label: "Google Business Profile" },
] as const;

export const SM_POST_TYPES = [
  { value: "static", label: "Static post" },
  { value: "carousel", label: "Carousel" },
  { value: "reel", label: "Reel / short video" },
  { value: "story", label: "Story" },
] as const;

export const SM_REPORTING: { value: ReportingFrequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Every two weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
];

export const SM_APPROVAL: { value: ApprovalProcess; label: string }[] = [
  { value: "each_post", label: "Clinic approves every post before it goes live" },
  { value: "monthly_calendar", label: "Clinic approves the monthly content calendar" },
];

export const SM_PUBLISHING: { value: PublishingBy; label: string }[] = [
  { value: "company", label: "Doctylia team publishes" },
  { value: "clinic", label: "Clinic publishes" },
];

const label = <T extends { value: string; label: string }>(list: readonly T[], v: string | null) =>
  list.find((o) => o.value === v)?.label ?? v ?? "—";
export const platformLabel = (v: string) => label(SM_PLATFORMS, v);
export const postTypeLabel = (v: string) => label(SM_POST_TYPES, v);
export const reportingLabel = (v: string | null) => label(SM_REPORTING, v);
export const approvalLabel = (v: string | null) => label(SM_APPROVAL, v);
export const publishingLabel = (v: string | null) => label(SM_PUBLISHING, v);

export function emptyScope(): SocialMarketing {
  return {
    platforms: [],
    posts_per_month: null,
    post_types: [],
    creative_included: false,
    calendar_included: false,
    publishing_by: null,
    community_management: false,
    paid_ads: false,
    ad_spend_monthly: null,
    reporting_frequency: null,
    monthly_fee: null,
    approval_process: null,
    notes: null,
    access_confirmed: false,
    agreed: false,
    agreed_on: null,
    agreement_ref: null,
  };
}

/** What is still undocumented. Empty = the service may be activated. */
export function missingForActivation(s: SocialMarketing): string[] {
  const m: string[] = [];
  if (s.platforms.length === 0) m.push("platforms");
  if (s.posts_per_month == null) m.push("posts_per_month");
  if (s.post_types.length === 0) m.push("post_types");
  if (!s.publishing_by) m.push("publishing_by");
  if (!s.reporting_frequency) m.push("reporting_frequency");
  if (!s.approval_process) m.push("approval_process");
  if (s.monthly_fee == null) m.push("monthly_fee");
  if (s.paid_ads && s.ad_spend_monthly == null) m.push("ad_spend_monthly");
  if (!s.access_confirmed) m.push("access_confirmed");
  if (!s.agreed || !s.agreed_on || !(s.agreement_ref ?? "").trim()) m.push("agreement");
  return m;
}

const MISSING_LABELS: Record<string, string> = {
  platforms: "At least one platform",
  posts_per_month: "Posts per month",
  post_types: "Post types",
  publishing_by: "Who publishes",
  reporting_frequency: "Reporting frequency",
  approval_process: "Content approval process",
  monthly_fee: "Monthly service fee",
  ad_spend_monthly: "Monthly ad spend (paid ads are included)",
  access_confirmed: "Account access confirmed",
  agreement: "Client agreement (date and reference)",
};
export const describeMissing = (keys: string[]) => keys.map((k) => MISSING_LABELS[k] ?? k);

/** The RPC arguments for save_social_marketing_scope (everything but the doctor id). */
export function scopeToRpcArgs(s: SocialMarketing) {
  return {
    _platforms: s.platforms,
    _posts_per_month: s.posts_per_month,
    _post_types: s.post_types,
    _creative_included: s.creative_included,
    _calendar_included: s.calendar_included,
    _publishing_by: s.publishing_by,
    _community_management: s.community_management,
    _paid_ads: s.paid_ads,
    _ad_spend_monthly: s.paid_ads ? s.ad_spend_monthly : null,
    _reporting_frequency: s.reporting_frequency,
    _monthly_fee: s.monthly_fee,
    _approval_process: s.approval_process,
    _notes: s.notes,
    _access_confirmed: s.access_confirmed,
    _agreed: s.agreed,
    _agreed_on: s.agreed ? s.agreed_on : null,
    _agreement_ref: s.agreed ? s.agreement_ref : null,
  };
}
