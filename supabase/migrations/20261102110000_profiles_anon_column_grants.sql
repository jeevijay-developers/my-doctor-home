-- Anonymous visitors may read only the public columns of profiles (the public booking page, blog and
-- queue pages). Payout ids, commission, GSTIN and plan/trial dates were readable by anyone with the
-- publishable key because the row policy "Public can view profiles by slug" is row-level only.
--
-- Scope: role anon ONLY. authenticated / service_role keep their grants, so a signed-in user viewing
-- another doctor's public page still receives every column of that row (residual risk; follow-up:
-- a safe view or RPC for authenticated public-page reads, then column grants for authenticated too).
--
-- Needed by anon policies as well: appointments/reviews INSERT checks read profiles.id and
-- profiles.onboarding_completed, the public SELECT policy reads slug + onboarding_completed. All are listed.
-- SECURITY DEFINER functions (directory / blog RPCs, token lookups) run as their owner and are unaffected.
-- Clients must not use select("*") on profiles as anon (it fails with permission denied).
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (
  id, slug, full_name, specialization, qualifications, experience_years, profile_photo_url,
  clinic_name, clinic_email, phone, address, city, state, locality, pincode, google_maps_url,
  consultation_fee, registration_number, onboarding_completed, plan_status,
  razorpay_payment_enabled, razorpay_account_status, bio
) ON public.profiles TO anon;
