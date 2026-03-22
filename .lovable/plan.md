

## Plan: Supercharge Landing Page with AI-Generated Visuals, Animations & Sales Content

### Current State
The landing page has solid structure but lacks visual richness — many sections are text-heavy with minimal imagery. Feature cards have AI-generated vector images but other sections (BeforeAfter, HowItWorks, Specialties, DetailedFeatures, FAQ, CTA) have no images. Animations exist via `AnimatedSection` wrapper but are basic fade-up only.

### Changes

#### 1. AI-Generated Section Illustrations
Generate brand-colored illustrations using Nano banana via an edge function, then store in Supabase storage. For build-time, use high-quality Unsplash medical images with brand overlay treatments.

**Add images to these sections:**
- **HowItWorks**: 3 step illustrations (doctor signing up on laptop, doctor customizing dashboard, doctor celebrating with patients)
- **BeforeAfter**: Left side — chaotic desk with papers; Right side — clean digital dashboard
- **Specialties**: Add a large hero image of diverse doctors group above the grid
- **DetailedFeatures**: Replace the wireframe mockups with richer CSS illustrations showing actual UI patterns
- **FAQ**: Replace the HelpCircle icon with a doctor-patient conversation illustration

Use Unsplash URLs with `?w=400&h=300&fit=crop` for compact, fast-loading images.

#### 2. Enhanced Animations (Framer Motion)
- **Hero**: Add parallax floating elements, staggered text reveal (word-by-word for headline)
- **TrustBar**: Add shimmer/glow pulse on the stat numbers
- **FeaturesGrid**: Cards get hover tilt effect (3D perspective) + staggered entrance
- **BeforeAfter**: Left card slides from left, right card slides from right
- **HowItWorks**: Steps animate in sequentially with connecting line drawing animation
- **Specialties**: Cards pop in with scale + stagger
- **Testimonials**: Auto-scrolling carousel on mobile, hover-pause
- **PricingSection**: Popular card has subtle glow pulse animation
- **CTA**: Background gradient animation (slowly shifting colors)

#### 3. Sales-Focused Content Upgrades
- **Hero**: Add rotating text ("Website Builder" → "Appointment System" → "Billing Tool" → "AI Assistant") using typewriter effect
- **Between TrustBar and Features**: Add new "As Seen In" / media logos strip (IMA, NMC, Economic Times, YourStory — as decorative credibility markers)
- **BeforeAfter**: Add a large "ROI Calculator" style stat — "Average doctor saves 14 hours/week with Doctylia"
- **After Specialties**: Add "Success Numbers" section — "₹2.4 Cr revenue generated for doctors", "50,000+ appointments booked", "98% satisfaction rate"
- **Before CTA**: Add "Risk-Free Guarantee" section — money-back guarantee badge, no-lock-in messaging
- **Testimonials**: Add video testimonial placeholder cards (play button overlay on image)

#### 4. New Micro-Sections

**A. "Trusted By Leading Doctors" Logo Strip** (after TrustBar)
- Horizontal scrolling row of hospital/clinic logo placeholders with grayscale treatment
- Subtle infinite scroll animation

**B. "Success Metrics" Section** (after Specialties)
- 3 large stat cards with gradient backgrounds: "₹2.4 Cr+ Revenue Generated", "50,000+ Appointments Booked", "14 Hours/Week Saved per Doctor"
- Each with a small relevant icon and brief description

**C. "Risk-Free Guarantee" Strip** (before CTA)
- Centered badge with shield icon
- "7-Day Free Trial • No Credit Card • Cancel Anytime • Full Refund if Not Satisfied"

### File Summary

| Action | Files |
|--------|-------|
| Modify | `LandingHero.tsx` — typewriter rotating text, staggered animations |
| Modify | `TrustBar.tsx` — shimmer effect on numbers |
| Modify | `FeaturesGrid.tsx` — 3D tilt hover, better stagger |
| Modify | `BeforeAfter.tsx` — slide-in animations, add stat callout + Unsplash images |
| Modify | `HowItWorks.tsx` — add step images, connecting line animation |
| Modify | `Specialties.tsx` — add hero image, pop-in animation |
| Modify | `DetailedFeatures.tsx` — richer mockup visuals |
| Modify | `Testimonials.tsx` — auto-scroll on mobile, video placeholder cards |
| Modify | `PricingSection.tsx` — glow pulse on popular card |
| Modify | `CTABanner.tsx` — animated gradient background, guarantee text |
| Modify | `FAQ.tsx` — add illustration image |
| Create | `src/components/landing/MediaLogos.tsx` — trusted-by logo strip |
| Create | `src/components/landing/SuccessMetrics.tsx` — big stat cards section |
| Create | `src/components/landing/Guarantee.tsx` — risk-free guarantee strip |
| Modify | `LandingPage.tsx` — wire 3 new sections |

### Build Order
1. Create MediaLogos, SuccessMetrics, Guarantee components
2. Enhance Hero with typewriter + staggered animations
3. Add images + animations to BeforeAfter, HowItWorks, Specialties
4. Enhance FeaturesGrid hover effects + DetailedFeatures mockups
5. Polish Testimonials, Pricing, CTA, FAQ with animations
6. Wire new sections into LandingPage

