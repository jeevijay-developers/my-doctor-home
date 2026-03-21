

## Plan: Mobile Responsive Fix + Visual Polish + Dashboard Mockup + Sales Content

### Key Issues Found

1. **`App.css` has `#root { max-width: 1280px; padding: 2rem }` leftover from Vite boilerplate** — even though not imported, it's still in the repo. Clean it up.
2. **Landing page `overflow-x` not locked** — no `overflow-x: hidden` on root or landing wrapper. Wide decorative blobs and floating cards can cause horizontal scroll on mobile.
3. **Hero section hides the entire right side on mobile** (`hidden lg:flex`) — mobile users see no imagery at all.
4. **Feature card images may overflow** on very small screens (320px).
5. **Pricing cards** use `borderImage` which doesn't work with `border-radius` — the popular card border renders as square on some browsers.
6. **Footer 5-column grid** collapses awkwardly on mobile (2-col with 5 items = orphan column).
7. **Contact section**: long address text may overflow on small screens.
8. **No dashboard mockup/preview** on the landing page — missing a key sales section showing what the admin panel looks like.
9. **Sales-focused copy** is decent but could be punchier with more urgency, social proof numbers, and benefit-driven language.

### Changes

#### 1. Global Overflow Fix
- **`src/index.css`**: Add `html, body { overflow-x: hidden; }` and ensure `#root` has no constraining styles.
- **Delete `src/App.css`** (unused Vite boilerplate).

#### 2. LandingPage Wrapper
- Add `overflow-x-hidden` to the wrapper div.

#### 3. LandingHero — Mobile Image + Sales Copy
- Show a smaller version of the hero image on mobile (below the text content) instead of hiding it completely.
- Update headline to more sales-focused: "Grow Your Practice 3x with India's #1 Doctor Platform"
- Add urgency: "Join 10,000+ doctors already growing with Doctylia"

#### 4. FeaturesGrid — Mobile Fix
- Ensure images have `max-w-full` and cards don't overflow.
- Update descriptions to be more benefit/outcome focused.

#### 5. PricingSection — Fix Popular Card Border
- Replace `borderImage` with a wrapper div approach for gradient border that respects `border-radius`.
- Make cards stack properly on mobile (1 column).

#### 6. NEW: Dashboard Mockup Section
- Add a new section between HowItWorks and Pricing called **"See Your Dashboard"**.
- Build a **static visual mockup** of the admin dashboard using pure CSS/HTML (not AI-generated image) — styled cards showing: sidebar nav, stat cards, appointment list, quick actions.
- This is a decorative/visual component, not functional. It sits in a browser frame mockup with a subtle perspective tilt.
- Below it: 3 smaller feature highlights (Real-time Analytics, One-Click Publishing, AI-Powered Insights).

#### 7. Testimonials — Sales Enhancement
- Add more social proof copy: "Trusted by 10,000+ doctors across 200+ cities"
- Add a small "Average rating: 4.9/5" badge.

#### 8. CTABanner — More Urgency
- Update copy: "Every day without Doctylia = patients lost to competitors"
- Add secondary line about limited-time offer.

#### 9. LandingFooter — Mobile Grid Fix
- Change grid to `grid-cols-1 sm:grid-cols-2 md:grid-cols-5` to stack cleanly on mobile.

#### 10. ContactSection — Mobile Fix
- Ensure address text wraps properly with `break-words`.

#### 11. HowItWorks — Tighter Mobile Spacing
- Reduce padding and font sizes on mobile.

#### 12. TrustBar — Mobile Text Size
- Smaller number font on mobile to prevent overflow.

### File Summary

| Action | Files |
|--------|-------|
| Delete | `src/App.css` |
| Create | `src/components/landing/DashboardPreview.tsx` |
| Modify | `src/index.css` — overflow-x fix |
| Modify | `src/pages/LandingPage.tsx` — add overflow class + DashboardPreview section |
| Modify | `src/components/landing/LandingHero.tsx` — mobile image, sales copy |
| Modify | `src/components/landing/FeaturesGrid.tsx` — mobile image fix, sales copy |
| Modify | `src/components/landing/PricingSection.tsx` — fix gradient border, mobile stack |
| Modify | `src/components/landing/Testimonials.tsx` — social proof badge |
| Modify | `src/components/landing/CTABanner.tsx` — urgency copy |
| Modify | `src/components/landing/LandingFooter.tsx` — mobile grid fix |
| Modify | `src/components/landing/ContactSection.tsx` — address overflow fix |
| Modify | `src/components/landing/TrustBar.tsx` — mobile text sizing |
| Modify | `src/components/landing/HowItWorks.tsx` — mobile spacing |

### Build Order
1. Delete App.css + fix index.css overflow
2. Fix all landing components for mobile responsiveness
3. Update sales-focused copy across all sections
4. Build DashboardPreview mockup component
5. Wire into LandingPage
6. Fix pricing gradient border

