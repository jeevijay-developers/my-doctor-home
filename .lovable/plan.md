

## Plan: Enhanced Landing Page with Enquiry Form, AI Images, and Full UI Polish

### Overview

Upgrade every section of the Doctylia landing page with richer visuals, compact AI-generated images on feature/testimonial cards, and add a website enquiry form that saves submissions to a new `enquiries` table (for super admin review).

---

### 1. Database: Enquiries Table

New migration to create `enquiries` table:

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default gen_random_uuid() |
| name | text | Required |
| email | text | Required |
| phone | text | Optional |
| clinic_name | text | Optional |
| city | text | Optional |
| message | text | Optional |
| status | text | Default 'new' (new/contacted/closed) |
| created_at | timestamptz | Default now() |

RLS: Public INSERT allowed (anyone can submit). No SELECT/UPDATE/DELETE for public — only service_role (super admin) can read.

### 2. Component Changes

#### LandingNavbar — Enhanced
- Add "Contact" nav link pointing to `#contact`
- Subtle shadow on scroll, smoother transitions
- Logo with tagline on desktop

#### LandingHero — Enhanced
- Add Unsplash/static medical hero image on the right side (doctor with tablet, modern clinic) instead of the text-based mockup
- Larger gradient background with animated blob shapes
- Improve spacing, badge styling, CTA button sizes

#### TrustBar — Enhanced
- Add compact trust logos/icons (IMA, NMC, HIPAA-style badges) as decorative elements
- Animated count-up numbers with intersection observer

#### FeaturesGrid — Enhanced with Images
- Each feature card gets a small (64x64 or 80x80) relevant medical illustration/icon image
- Images: website screenshot, calendar, invoice, patient record, AI brain, video call, WhatsApp, analytics chart
- Use high-quality Unsplash URLs for compact thumbnails
- Card hover: subtle lift + border color change

#### HowItWorks — Enhanced
- Add step connection lines (dashed SVG path between circles)
- Each step gets a small illustration image below the icon
- Better number styling

#### PricingSection — Enhanced
- Add small feature icons next to each feature text
- Popular card gets gradient border instead of solid
- Annual/Monthly toggle (UI only, same prices for now)

#### Testimonials — Enhanced with Doctor Photos
- Each review card gets a circular doctor avatar image (Unsplash portraits)
- Add clinic/city below name
- Star rating more prominent with gold color

#### FAQ — Enhanced
- Add a small illustration on the left side
- Better accordion styling with icons

#### NEW: ContactSection (Enquiry Form)
- Section between FAQ and CTA Banner
- Left side: contact info (email, phone, office address placeholder)
- Right side: form with fields: Name, Email, Phone, Clinic Name, City, Message
- Submit saves to `enquiries` table via Supabase client
- Success toast on submission
- Input validation with proper error states

#### CTABanner — Enhanced
- Add background pattern/image overlay
- Larger text, animated entrance
- Secondary text line about doctor count

#### LandingFooter — Enhanced
- 5-column layout: Brand + tagline, Product links, Company links, Legal, Newsletter/social
- Add social media icons (Facebook, Instagram, LinkedIn, YouTube, Twitter)
- Newsletter email input (UI only)
- Indian flag + "Made in India" badge

### 3. Images Strategy

Use high-quality Unsplash URLs with `w=200&h=200&fit=crop` parameters for compact card images. Categories:
- Features: medical tech, scheduling, billing, patient care
- Testimonials: professional Indian doctor portraits
- Hero: modern clinic/doctor with technology
- How It Works: signup screen, clinic setup, live website

### 4. File Summary

| Action | Files |
|--------|-------|
| Migration | 1 — `enquiries` table with public INSERT RLS |
| New | `src/components/landing/ContactSection.tsx` |
| Modify | `LandingNavbar.tsx`, `LandingHero.tsx`, `TrustBar.tsx`, `FeaturesGrid.tsx`, `HowItWorks.tsx`, `PricingSection.tsx`, `Testimonials.tsx`, `FAQ.tsx`, `CTABanner.tsx`, `LandingFooter.tsx`, `LandingPage.tsx` |

### Build Order

1. Create `enquiries` table migration
2. Build ContactSection with form + Supabase insert
3. Enhance all landing components with images, better spacing, richer UI
4. Update LandingPage to include ContactSection
5. Polish navbar and footer

