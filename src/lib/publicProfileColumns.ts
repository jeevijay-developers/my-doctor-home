// Columns of `profiles` that anonymous visitors (public booking site, blog, SEO edge function)
// may read. Anon is NOT granted the sensitive columns (razorpay_account_id / stakeholder / product,
// commission_percent, gstin, plan_tier, plan_end, trial_*, custom_plan_price ...), so every
// public read must name its columns instead of select("*").
//
// Kept to what the public UI actually uses:
//  - plan_status: public pages 404 a "cancelled" doctor
//  - registration_number: shown in the About section
//  - razorpay_payment_enabled / razorpay_account_status: BookingWidget online-payment gate
// Plain string, no imports: also bundled by the Vercel Edge function (src/lib/seo).
export const PUBLIC_PROFILE_COLUMNS = [
  "id", "slug", "full_name", "specialization", "qualifications", "experience_years",
  "profile_photo_url", "clinic_name", "clinic_email", "phone", "address", "city", "state",
  "locality", "pincode", "google_maps_url", "consultation_fee", "registration_number",
  "onboarding_completed", "bio", "plan_status", "razorpay_payment_enabled", "razorpay_account_status",
].join(",");
