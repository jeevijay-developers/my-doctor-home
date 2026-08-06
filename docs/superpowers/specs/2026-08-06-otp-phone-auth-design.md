# Design: Phone (OTP) Authentication for Doctor Login/Signup

**Status:** Approved by user, ready for implementation planning
**Date:** 2026-08-06
**Scope:** `src/pages/Auth.tsx` and a new `src/components/auth/PhoneOtpForm.tsx`. No other pages/features touched.

## Context

`Auth.tsx` is the doctor-facing login/signup page for the Doctylia SaaS product (not the patient
appointment-booking flow, which already uses a separate phone+token verification scheme). It
currently supports:

1. Email + password (signup / login / forgot password)
2. "Continue with Google" — placeholder only, shows a "coming soon" toast, not implemented

This adds **Phone + OTP** as a second real authentication method, selectable via tabs, alongside
email/password. Google stays an unimplemented placeholder — out of scope for this feature.

**Roadmap note (important context, not part of this build):** the user's stated long-term
direction is to eventually **remove email/password authentication entirely**, leaving OTP-only
auth as the single method. The current state — both methods live side by side — is an explicit
transitional/testing phase. This spec does not implement that removal, but the design choices
below (phone-only accounts being fully valid, no forced linking to an email identity) are made
so that a future "drop email/password" change doesn't require unwinding data-model assumptions
made here.

## External dependencies (dashboard/account setup — NOT achievable via code alone)

These must be configured by the user outside this codebase. The code will be written regardless,
but phone signup/login will fail at the "send OTP" step until both are done — this is expected,
not a bug, the same situation as the earlier Zoom integration.

1. **SMS provider** — Supabase Dashboard → Authentication → Providers → Phone. Requires a
   Twilio, MessageBird, or Vonage account and its credentials entered there. **Confirmed via
   direct query: this project currently has zero users with a phone number set, and phone auth
   has never been exercised — almost certainly not configured yet.** This cannot be checked
   programmatically (SQL/MCP have no visibility into Supabase Auth provider config); the user
   must confirm/complete this in the dashboard.
2. **CAPTCHA (Cloudflare Turnstile)** — Supabase Dashboard → Authentication → Settings → Bot and
   Abuse Protection → enable, provider = Turnstile, paste **secret key**. Get both site key
   (public) and secret key (private) from https://dash.cloudflare.com/?to=/:account/turnstile.
   The site key goes into the frontend as `VITE_TURNSTILE_SITE_KEY` in `.env`; the secret key
   goes only into the Supabase dashboard, never into this repo.

## Data model

**No schema migration required.**

- `profiles.id` / `auth.users.id`: already supports `auth.users.email = null` (phone-only
  identity) — verified this is not a NOT NULL constraint blocking phone-only accounts.
- `profiles.phone`: already exists (nullable, free text) — currently used as clinic-contact-info
  display field. Kept conceptually separate from the *auth* phone number even when they hold the
  same value, so a doctor changing their display contact number later doesn't silently change
  their login credential, and vice versa.
- Whatever currently populates `profiles` on new-user creation (a `handle_new_user()`-style
  trigger on `auth.users` insert) needs to be checked during implementation to confirm it doesn't
  assume `email IS NOT NULL` — if it does, that's a small fix inside this feature's scope since
  it would otherwise break phone signup silently.

## Decisions made during brainstorming

| Question | Decision |
|---|---|
| Email required for phone signup? | No — phone-only account is valid. Email can be added later from account settings (not built in this pass; just not blocked). |
| Toggle placement | Tabs (Email / Phone) below the Google button + divider, above the form. Google stays where it is, unaffected by which tab is active. |
| OTP rate limiting | Rely on Supabase's built-in cooldown/hourly caps. Client just reflects the cooldown in the Resend button's disabled/countdown state, resynced from any rate-limit error Supabase returns. |
| Signup fields | Phone signup collects Full Name too, same as email signup. Same post-signup path: trial defaults (existing DB defaults handle this) → `/onboarding`. |
| Account linking (email account vs phone account for same person) | Out of scope. Each method is its own independent identity; no merge/detection logic. Acceptable because the roadmap collapses to one method (OTP-only) eventually anyway. |
| CAPTCHA | Cloudflare Turnstile, scoped to the OTP-send action only (both signup and login, since both call `signInWithOtp` and both can trigger an SMS). Chosen over hCaptcha for a lighter/more passive widget on a flow meant to stay frictionless. |

## Component structure

### `Auth.tsx` changes

- New state: `authMethod: "email" | "phone"`, default `"email"` (preserves current behavior as
  the primary path). Tabs only render when `mode !== "forgot"` — phone has no password-reset
  analog.
- When `authMethod === "phone"`, the form body is replaced with:
  ```tsx
  <PhoneOtpForm mode={mode} onAuthenticated={handleAuthenticated} safeNext={safeNext} />
  ```
  The existing email/password `<form>` is unchanged and still renders as-is when
  `authMethod === "email"`.
- `handleAuthenticated(session)`: extracted from the tail of the current email-login branch in
  `handleSubmit` (the `has_role` → `/superadmin` / profile-completed → `/admin/dashboard` or
  `/onboarding` redirect logic). Both methods now funnel through this single function instead of
  duplicating the routing logic.

### New `src/components/auth/PhoneOtpForm.tsx`

Props: `{ mode: "login" | "signup"; onAuthenticated: (session: Session) => void; safeNext: string | null }`

State machine:
- `step: "enter-phone" | "enter-otp"`
- `phone`, `otp`, `fullName` (signup only), `loading`, `cooldownSeconds`, `captchaToken`

**Step 1 — `enter-phone`:**
- Inputs: Phone number (+ Full Name if `mode === "signup"`), Turnstile widget, "Send OTP" button.
- Client-side phone format validation before calling Supabase (avoid burning a send attempt / SMS
  cost on obviously-invalid input).
- Calls `supabase.auth.signInWithOtp({ phone, options: { captchaToken, shouldCreateUser: mode === "signup", data: mode === "signup" ? { full_name: fullName } : undefined } })`.
  - `shouldCreateUser: false` on login means an unregistered phone number errors immediately,
    no OTP sent, no SMS cost — surfaced as "No account found with this phone number. Sign up
    instead?" with a link that flips `mode`/tab to signup.
  - Turnstile tokens are single-use — widget must reset and issue a fresh token after every
    send attempt (success or failure).
- On success → `step = "enter-otp"`, start `cooldownSeconds` countdown for the Resend control.

**Step 2 — `enter-otp`:**
- 6-digit OTP input, "Verify" button, "Resend OTP" (disabled during cooldown).
- Calls `supabase.auth.verifyOtp({ phone, token: otp, type: "sms" })`.
- On success → `onAuthenticated(data.session)`.
- On wrong/expired code → inline error under the input, code field clears, **stays on this step**
  (does not force back to phone entry).

## Error handling

| Case | Behavior |
|---|---|
| Invalid phone format | Inline validation error, no API call made |
| Login, unregistered phone (`shouldCreateUser:false` rejects) | "No account found... Sign up instead?" + tab-switch link |
| Signup, phone already registered | Supabase sends OTP and verifies into the *existing* account rather than erroring (known Supabase behavior) — not special-cased; verification success routes through the normal `handleAuthenticated` (has_role/onboarding check) exactly like any login |
| Wrong/expired OTP | Inline error, stays on OTP step |
| Resend spam / rate-limit response from Supabase | Cooldown timer resynced from the error's retry-after rather than trusting only the local timer |
| SMS provider not yet configured (current project state) | `signInWithOtp` errors, surfaced as a normal `toast.error` — expected until the dashboard step above is completed |
| CAPTCHA not configured / token invalid | Same — surfaced as a normal toast error from the Supabase call, not a crash |
| Network/unexpected errors | Same existing pattern used elsewhere in `Auth.tsx`: `toast.error(err.message || "Something went wrong")` |

## Testing

- **Automated (unit-level):** `PhoneOtpForm`'s state machine — step transitions, cooldown
  countdown behavior, phone format validation — with the Supabase client mocked. This is real,
  written, runnable test coverage.
- **Manual checklist** (executed once SMS provider + Turnstile are both configured — cannot be
  automated meaningfully without a real/mocked SMS provider):
  - Phone signup happy path
  - Phone login happy path
  - Wrong OTP
  - Expired OTP
  - Resend cooldown UI behaves correctly
  - Login attempt with unregistered phone number
  - Signup attempt with an already-registered phone number
  - Switching Email ↔ Phone tabs mid-flow doesn't leak state between the two forms
  - CAPTCHA widget blocks submission until solved/passed
- **Regression check:** existing email/password flow (signup, login, forgot password) is
  unchanged — smoke-test that switching to the Phone tab and back doesn't disturb the email
  form's state, but no new tests needed for the email path itself.

## Explicitly out of scope

- Removing/deprecating email+password auth (future work, not this pass)
- Implementing the "Continue with Google" button (stays a placeholder)
- Account linking/merging between an email identity and a phone identity for the same person
- Adding an email address to an existing phone-only account (future account-settings work)
- Extra app-level SMS rate-limiting beyond Supabase's built-in limits
