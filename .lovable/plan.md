

## Plan: Dashboard Fix + Landing Page Content & Visual Enhancement

### Part 1: Dashboard Fixes

**Issues found in DashboardHome.tsx:**
- HSL color references like `bg-[hsl(var(--royal)/.08)]` may not render correctly — Tailwind doesn't parse `/opacity` inside `hsl()` in arbitrary values consistently
- The dashboard renders fine structurally but colors may appear broken or invisible

**Fix:** Replace all `hsl(var(--X)/.N)` patterns with proper Tailwind brand color classes (e.g., `bg-royal/8`, `bg-teal/8`) which work with the configured color palette in tailwind.config.

Also improve the dashboard:
- Add a "Website Preview" card showing doctor's live page link with a mini thumbnail
- Add "This Week's Revenue" chart placeholder (simple bar chart visual using CSS bars)
- Improve empty states with illustrations
- Better stat card hover effects and micro-interactions

### Part 2: Landing Page — More Content & Visuals

**New sections and enhancements to add:**

#### A. "Before vs After Doctylia" Comparison Section (NEW)
Between Features and HowItWorks. Two-column layout:
- Left: "Without Doctylia" — red-tinted list (missed calls, paper records, no online presence, manual billing)
- Right: "With Doctylia" — green-tinted list (24/7 booking, digital records, branded website, auto billing)
- Highly persuasive for conversion.

#### B. "Built for Every Specialty" Section (NEW)
After DashboardPreview. Grid of specialty cards showing Doctylia works for Cardiologists, Dermatologists, Pediatricians, Dentists, Orthopedics, Gynecologists, etc. Each with a small icon + specialty name + "X doctors already using" count. Builds confidence that the platform fits ANY doctor.

#### C. "What You Get" Detailed Tabs Section (NEW)
Before Pricing. Tabbed interface (Website | Appointments | Billing | AI Tools) — each tab shows a detailed feature breakdown with checkmarks and a visual mockup/icon. Gives deeper info before the pricing section so visitors feel informed.

#### D. Enhance Existing Sections
- **Hero**: Add a small animated badge "🔥 2,847 doctors signed up this month"
- **Testimonials**: Add 3 more reviews (6 total, show in 2 rows) with more specialties
- **FAQ**: Add 3 more questions (total 9) covering pricing, support, data migration
- **CTA Banner**: Add 3 small trust icons (SSL secure, HIPAA-ready, 24/7 support)
- **Pricing**: Add "Compare Plans" feature table below the cards

### File Summary

| Action | Files |
|--------|-------|
| Modify | `src/components/admin/DashboardHome.tsx` — fix color classes, add website preview card, revenue chart visual |
| Create | `src/components/landing/BeforeAfter.tsx` — comparison section |
| Create | `src/components/landing/Specialties.tsx` — specialty grid |
| Create | `src/components/landing/DetailedFeatures.tsx` — tabbed feature deep-dive |
| Modify | `src/components/landing/LandingHero.tsx` — add signup count badge |
| Modify | `src/components/landing/Testimonials.tsx` — add 3 more reviews |
| Modify | `src/components/landing/FAQ.tsx` — add 3 more questions |
| Modify | `src/components/landing/CTABanner.tsx` — add trust icons |
| Modify | `src/components/landing/PricingSection.tsx` — add comparison table |
| Modify | `src/pages/LandingPage.tsx` — wire new sections |

### Build Order
1. Fix DashboardHome color classes + add new cards
2. Build BeforeAfter comparison section
3. Build Specialties grid
4. Build DetailedFeatures tabbed section
5. Enhance Testimonials, FAQ, CTA, Pricing
6. Wire everything into LandingPage

