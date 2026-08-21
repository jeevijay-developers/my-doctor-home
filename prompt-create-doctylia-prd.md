# Prompt for Claude Code: Create a PRD.md for Doctylia

Create a comprehensive **Product Requirements Document** for Doctylia and save it as `PRD.md` in the project root.

## Instructions
1. Start from `CLAUDE.md` for the technical architecture (four app surfaces, role/permission systems, Supabase integration, plan tiers) — don't re-derive this from scratch, but translate it into product-facing language rather than engineering language.
2. Walk the actual codebase (`src/pages/`, `src/components/admin/*`, `src/components/superadmin/*`, `src/components/doctor/*`, `supabase/functions/*`, `supabase/migrations/*`) to confirm what's actually built versus planned/partial — don't guess or assume a feature exists just because it sounds like it should. Note explicitly which areas of this PRD reflect shipped functionality vs. in-progress work, based on what you find.
3. Structure the document with the sections below. Where you're uncertain about intent (business goals, target metrics, competitive positioning) rather than technical fact, use `[TBD — confirm with founder]` placeholders rather than inventing plausible-sounding answers.

## Required Sections

### 1. Overview
What Doctylia is, who it's for (solo doctors and small clinics in India, per the marketing copy — confirm this against the actual homepage content), and the core value proposition.

### 2. User Roles & Personas
Document each of the four distinct user types this system serves, and what each one needs from the product:
- **Patients** (booking, paying, receiving care)
- **Doctors** (running their practice via the admin panel)
- **Staff** (permission-scoped delegated access under a doctor)
- **Superadmin** (Doctylia's own platform operations team)

### 3. Core Feature Areas
For each of the four app surfaces (public marketing site, doctor's public booking site, admin panel, superadmin panel), document the actual features present, organized by module. Base this on a real pass through the codebase, not assumption — list what each admin panel sidebar item and each superadmin sidebar item actually does. Include: appointment booking & management, patient records, prescriptions, billing & revenue, staff management with granular permissions, subscription plans (Free trial/Pro/Premium) and payment processing, the AI Blog Writer, website customization (My Website builder), and platform-level superadmin tools (doctor management, subscriptions, payments & payouts, support tickets, moderation, feature flags, audit log).

### 4. Business Model
Subscription tiers and pricing structure (Free trial → Pro/Premium), the platform's own revenue model (subscription fees from doctors), and how patient payments flow through the platform (Razorpay integration, doctor payouts via RazorpayX). Note explicitly per `CLAUDE.md`: **no per-transaction platform commission is taken from patient payments** — doctors receive the full fee they charge; platform revenue comes from doctor subscription fees only.

### 5. Non-Functional Requirements
- **Compliance:** India-specific requirements already identified in prior work — DPDP Act (data protection), TRAI DLT (SMS), WhatsApp Business API template approval for authentication/utility messages.
- **Responsive design:** requirements across mobile/tablet/desktop, per the established convention in `CLAUDE.md` (real `<table>` + parallel mobile card list pattern).
- **Security:** RLS-based authorization split between platform-level (`user_roles`) and practice-level (`profiles`/`staff_members`) permission systems.

### 6. Known Gaps & Open Questions
Be honest here — list anything found during the codebase walkthrough that's partially built, inconsistent, or has an unresolved product decision attached to it (e.g. check for TODOs, incomplete features, or half-implemented flows). Don't paper over these to make the document look more finished than the product actually is.

### 7. Out of Scope / Explicit Non-Goals
Anything intentionally not being built right now, if that's discoverable from context (e.g. no true recurring-subscription billing table, no invoice-generation model for platform subscriptions, per patterns seen elsewhere in this codebase).

## Formatting
Use clear headers, keep prose concise, use tables where comparing tiers/roles/permissions would be clearer than paragraphs. This document should be usable by a non-technical stakeholder (e.g. for fundraising, hiring, or planning) as well as by future engineers joining the project — so avoid deep technical jargon in the main body, but a short technical appendix referencing `CLAUDE.md` is fine at the end for engineering readers.
