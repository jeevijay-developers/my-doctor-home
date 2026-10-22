# Fixes made in this conversation

These are changes added in this session. Items that were already in the codebase and only verified (RLS on every table, Razorpay webhook HMAC, admin route guards, existing pagination, existing skeletons, and so on) are not listed.

Nothing in the Supabase section is live on the Doctylia project (`atmelijhxsjzjixhdfcu`) yet. The CLI account and both connected Supabase projects point at other databases, so the migration and Edge Functions still need a deploy from the project owner.

## Security checklist

- Production security headers on every response in `vercel.json`: `X-Content-Type-Options`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Strict-Transport-Security`, `Permissions-Policy`, and a Content-Security-Policy covering Supabase, Razorpay, Google Analytics, and Cloudflare Turnstile. CSP `upgrade-insecure-requests` covers HTTPS.
- `create-e2e-session` returns 403 unless `ENABLE_E2E_AUTH=true`.
- `bootstrap-admin` returns 403 unless `ENABLE_BOOTSTRAP_ADMIN=true` or the `x-bootstrap-secret` header matches `BOOTSTRAP_ADMIN_SECRET`.
- PostgREST `.or()` search in `src/lib/mcp/tools/list_patients.ts` strips `,()%_` before interpolation.
- Storage buckets now have server-side limits in `supabase/migrations/20261021163000_security_and_performance_hardening.sql`: `doctor-uploads` is 5 MB and image MIME types only; `patient-documents` is 10 MB and PDF or image MIME types only.
- Razorpay HMAC checks use constant-time comparison (`timingSafeEqualHex`) in the webhook, payment verification, and plan-upgrade verification functions.
- Successful refunds and doctor payouts write a row to `admin_audit_log`.
- Database-backed per-IP rate limiting in `supabase/migrations/20261022120000_rate_limiting.sql` and `supabase/functions/_shared/rateLimit.ts`:
  - Staff login: 5 attempts / 15 min per IP and 10 / 15 min per username.
  - Public booking (`create-razorpay-order`): 10 requests / 10 min per IP.
  - AI blog writer: 20 generations / hour per doctor.
  - Mock OTP login and the patient enquiry function: 5 requests / 10 min per IP.
  - Over the limit the response is 429 with `Retry-After`. If the migration is not applied, those endpoints return 503 instead of skipping the check.
- CORS is no longer `*`. `supabase/functions/_shared/cors.ts` allows `https://doctylia.com`, `https://www.doctylia.com`, and local dev origins. Requests with no `Origin` header (the Android app and other native clients) still pass. Other browser origins do not get `Access-Control-Allow-Origin`.
- Cloudflare Turnstile is verified on the server for staff login, booking orders, and patient enquiries (`supabase/functions/_shared/turnstile.ts`). Missing or invalid tokens return 400. The widget renders only when `VITE_TURNSTILE_SITE_KEY` is set.
- Patient enquiries no longer insert straight into `patient_queries`. They go through `supabase/functions/submit-patient-query`, which checks the CAPTCHA, rate-limits, validates the payload, and rejects cancelled doctors.
- Superadmin blog preview in `SAModeration.tsx` sanitizes HTML with DOMPurify before `dangerouslySetInnerHTML`. JSON-LD script tags escape `<`.

## Website performance checklist

- Below-the-fold images use `loading="lazy"` and `decoding="async"` on the landing page, doctor pages, blog cards, and superadmin views. Hero images stay eager.
- Content images were converted to WebP, and the two largest (hero and dashboard preview) also have AVIF inside `<picture>`. Examples: hero 373 KB to 17 KB AVIF, dashboard preview 798 KB to 22 KB AVIF.
- Route-level code splitting: secondary, auth, admin, doctor, and superadmin pages load with `React.lazy` and `Suspense`. `vite.config.ts` splits vendor chunks (`vendor-react`, `vendor-supabase`, `vendor-radix`, `vendor-charts`, `vendor-editor`, `vendor-pdf`, `vendor-motion`) and minifies CSS. Production entry bundle measured at about 94 KB gzipped.
- React Query defaults: `staleTime` 60 seconds, `gcTime` 5 minutes, no refetch on window focus.
- `usePaymentMode`, `useNotificationMode`, and `usePlatformSettings` cache for 60 seconds and dedupe in-flight requests. The payment and notification mode functions send `Cache-Control: public, max-age=60, s-maxage=300`.
- Search inputs on the blog page, superadmin doctors, and superadmin subscriptions are debounced (300 ms).
- Prescriptions render `PaginationBar`, so rows past the first page are reachable.
- Inter and Plus Jakarta Sans are self-hosted as Latin woff2 (`public/fonts/`, 47 KB and 27 KB) with `font-display: swap`. The Google Fonts stylesheet, preconnects, and the unused Font Awesome stylesheet were removed.
- Eleven missing indexes were added for patients, prescriptions, appointments, services, packages, reviews, gallery photos, blog posts, working hours, and support tickets.

## SEO checklist

- `public/sitemap.xml` lists the static public routes.
- `supabase/functions/sitemap` builds a dynamic sitemap (marketing pages, `/dr/:slug`, published posts) with a one-hour browser cache and a six-hour CDN cache. It is registered with `verify_jwt = false`. It is not deployed to the Doctylia project yet.
- `public/robots.txt` disallows `/admin`, `/superadmin`, `/onboarding`, `/reset-password`, `/staff-login`, and `/.lovable/`, and declares the sitemap.
- Self-referencing canonical tags on the homepage, landing page, doctor pages, and blog pages.
- Unique `document.title` and meta descriptions on public, auth, policy, admin, and superadmin routes. Doctor pages honor `seo_title` / `seo_description` and fall back to the doctor's name, specialty, and city.
- Open Graph and Twitter card tags, including image alt text, on the homepage and the dynamic public pages.
- JSON-LD: `Organization`, `WebSite`, and `SoftwareApplication` in `index.html`; `FAQPage` on the landing page; `Physician` / `MedicalBusiness` and breadcrumbs on doctor pages; `Blog`, `BlogPosting` (with author and reviewer), and breadcrumbs on blog pages.
- Google Search Console verification meta tag: `google-site-verification=9azDin6spSy8x7jTUfsHKL02y-Gaz_wWVJELSQCsJPE`.
- Blog posts link to the doctor's booking section. Footer section links work from pages other than the homepage. Social icon links are real URLs with `rel="noopener noreferrer"` instead of `href="#"`.
- Explicit image width, height, and `decoding="async"` on blog avatars.

## AEO and GEO checklist

- FAQ answers are also in `FAQPage` JSON-LD so they are available without opening the accordion.
- Doctor, clinic, price, and service facts are in `Physician` JSON-LD, including city and INR offers.
- `public/robots.txt` allows search and citation crawlers, with `OAI-SearchBot` separate from `GPTBot`, plus `ChatGPT-User`, `PerplexityBot`, `ClaudeBot`, `Claude-SearchBot`, `Google-Extended`, `Applebot-Extended`, `Googlebot`, and `Bingbot`.
- Landing and doctor pages use a `<main>` landmark.
- Brand name "Doctylia" is in the title and social tags. Plan prices in schema match the page (Pro ₹1,499, Premium ₹3,999).
- Doctor-count claims are one figure: **2,500+** (hero, trust bar, testimonials, auth, before/after). Specialty count matches the 10 specialties rendered. Removed conflicting figures (2,847, 10,000+, 70%, 80%, ₹2.4 Cr, 98%, 14 hours, 6+ specialties). Deleted the unused `SuccessMetrics` component. The default "98% success rate" quick stat is blank.
- New case-studies section on the landing page. Three scenarios use only published facts (10-minute setup, live plan prices) and are labeled as representative examples, not customer results.
- Privacy policy discloses Google Analytics 4 and links to Google's privacy policy.
- GA4 `G-9H9CEZ6C6K` loads from `index.html`. A small router listener sends `page_view` on client-side navigations. CSP allows the Google tag hosts.

## Vibe-coded website fixes

- `overflow-x-hidden` on the remaining page and layout roots (404, about, policies, auth, staff login, reset password, onboarding, manage appointment, admin, superadmin).
- Onboarding "View my website" uses the slug that was actually saved.
- Mobile menus close when a link is chosen (landing navbar and superadmin sidebar).
- Branded 404 page with a way home, back, and links to login, about, and contact.
- Auth copyright year is `new Date().getFullYear()`.
- Phone numbers use `tel:` and email addresses use `mailto:` on the contact section, doctor footer, patient and appointment detail sheets, doctor detail, and leads.
- Logos link home (or to the matching dashboard) in the landing footer, reset password, onboarding, admin sidebar, and superadmin sidebar.
- Onboarding shows a success toast when the clinic site goes live.
- Signup requires a Terms of Service and Privacy Policy checkbox. Send OTP stays disabled until it is checked. The links go to `/terms` and `/privacy`. Login does not show the checkbox.
- Login and signup page palette is three colors: navy, sky blue `#3C83FC`, and lime `#BFE038`. Gradient orbs and staggered motion on that screen were removed.
- The em dash character was replaced with a hyphen on public pages, doctor booking UI, legal pages, titles, and social meta tags.

## Still needs you

- Deploy from an account that can see project `atmelijhxsjzjixhdfcu`: `npx supabase db push`, then deploy the updated Edge Functions (including `sitemap` and `submit-patient-query` with `--no-verify-jwt`). Do not deploy `mcp` or `send-sms-hook`.
- Set `TURNSTILE_SECRET_KEY` on Edge Function secrets and `VITE_TURNSTILE_SITE_KEY` on the frontend host.
- After the sitemap function is live, point `robots.txt` at it and submit it in Search Console.
- Directory listings (G2, Capterra, SaaSHub, AlternativeTo, Crunchbase, SoftwareSuggest, Techjockey, LinkedIn product on the existing Jeevijay page) require your login. No listings were submitted.
- AI citation tests (the 15 prompts) and the GA4 baseline export for 23 July 2026 through 21 October 2026 are manual.
