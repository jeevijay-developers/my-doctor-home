

## Plan: Remove Duplicates, Unify Color Theme & Add Consistent Visuals

### Duplicate Content Found

| Section | Issue |
|---------|-------|
| **TrustBar** vs **SuccessMetrics** | Both are dark navy stat sections. TrustBar says "500,000+ Appointments" while SuccessMetrics says "50,000+ Appointments" — contradicting numbers. Both have similar layouts. |
| **FeaturesGrid** vs **DetailedFeatures** | Both describe the same 4-8 features (Website, Appointments, Billing, AI). FeaturesGrid is card overview, DetailedFeatures is tabbed deep-dive — overlapping. |
| **Guarantee** vs **CTABanner** | Both mention "7-day free trial, no credit card". Guarantee is a separate strip that adds little value before CTA. |
| **"7-day free trial" messaging** | Repeated in Hero, TrustBar area, Pricing header, Guarantee, CTABanner — 5 times. Keep in Hero + Pricing + CTA only. |

### Fix: Consolidate & Streamline

1. **Merge TrustBar + SuccessMetrics** → Keep TrustBar (compact stats bar after hero) and **remove SuccessMetrics** as a standalone section. Instead, fold its key stat (₹2.4Cr revenue) into the BeforeAfter ROI callout.

2. **Merge FeaturesGrid + DetailedFeatures** → Keep FeaturesGrid as the overview. Convert DetailedFeatures into a "How Each Feature Works" section with different content — real use-case scenarios instead of repeating the same feature names. Or **remove DetailedFeatures** entirely and let FeaturesGrid + DashboardPreview cover features.

3. **Remove Guarantee section** — fold its trust badges into CTABanner (already has trust badges).

4. **Fix contradicting numbers** — standardize to consistent stats across all sections.

### Color Theme Unification

Current issue: Two sections use `bg-primary` (dark navy) — TrustBar and CTABanner. SuccessMetrics also uses dark navy. Three dark sections feel heavy.

**New section background pattern:**
```text
Hero        → gradient (white → cloud-blue)
TrustBar    → bg-primary (navy) — only dark section in top half
MediaLogos  → bg-white
Features    → bg-white
BeforeAfter → bg-secondary (light gray-blue)
HowItWorks  → bg-white (was secondary — swap for alternation)
Dashboard   → bg-secondary
Specialties → bg-white
Pricing     → bg-secondary
Testimonials→ bg-white
FAQ         → bg-secondary
Contact     → bg-white
CTABanner   → bg-primary (navy) — only dark section in bottom half
Footer      → bg-primary (navy)
```

This gives a clean alternating white/secondary rhythm with exactly 2 dark sections (TrustBar + CTA).

### Visuals: Add Unsplash Images Throughout

Add compact, relevant medical Unsplash images (with `?w=400&h=300&fit=crop&q=80`) to sections that are currently text-only:

| Section | Image Addition |
|---------|---------------|
| **HowItWorks** | Each step gets a small rounded image below the icon (doctor on laptop, clinic setup screen, happy doctor with patients) |
| **BeforeAfter** | Small illustration-style image in each card header (messy desk vs clean dashboard) |
| **Specialties** | Hero banner image above grid (diverse doctors group) |
| **FAQ** | Replace HelpCircle with a warm doctor-patient image |
| **ContactSection** | Add a small office/team image in the contact info card |

All images use the same rounded corners (rounded-xl), consistent sizing, and brand-tinted overlays where needed.

### File Changes

| Action | File |
|--------|------|
| Delete section | Remove `SuccessMetrics.tsx` import from LandingPage |
| Delete section | Remove `Guarantee.tsx` import from LandingPage |
| Remove | `DetailedFeatures.tsx` import from LandingPage (consolidate into FeaturesGrid) |
| Modify | `LandingPage.tsx` — remove 3 sections, fix background alternation |
| Modify | `TrustBar.tsx` — fix numbers to be consistent |
| Modify | `HowItWorks.tsx` — add Unsplash step images, change bg to white |
| Modify | `BeforeAfter.tsx` — add small header images, merge ROI stat from SuccessMetrics |
| Modify | `Specialties.tsx` — add hero banner image, change bg to white |
| Modify | `FAQ.tsx` — add warm image replacing HelpCircle, change bg to secondary |
| Modify | `ContactSection.tsx` — add small image, change bg to white |
| Modify | `CTABanner.tsx` — fold Guarantee trust badges into this section |
| Modify | `FeaturesGrid.tsx` — ensure feature card images render consistently |
| Modify | `Testimonials.tsx` — change bg to white |

### Build Order
1. Remove duplicate sections from LandingPage (SuccessMetrics, Guarantee, DetailedFeatures)
2. Unify background colors for clean alternation
3. Fix contradicting stats across TrustBar/BeforeAfter
4. Add Unsplash images to HowItWorks, BeforeAfter, Specialties, FAQ, Contact
5. Fold Guarantee badges into CTABanner

