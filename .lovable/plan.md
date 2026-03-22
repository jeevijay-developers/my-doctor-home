

## Plan: Header Fix + Full Mobile Responsive Polish + UI Enhancement

### 1. Header (LandingNavbar) Updates

**Remove tagline text** beside logo (line 29 — the "The Complete Doctor Platform" `<span>`).

**Frosted glass sticky header with content fade-through:**
- Change from `bg-white/98` to a proper frosted glass: `bg-white/70 backdrop-blur-xl` when scrolled, `bg-transparent` at top
- This creates the effect where scrolled content blurs/fades behind the header

### 2. Mobile Responsive Fixes (all landing components)

**LandingHero:**
- Hero image currently `hidden lg:flex` — show it on mobile too but smaller (w-[180px]) below text
- Floating stat cards: hide on mobile (too cramped), show from `sm:` up
- Reduce mobile heading to `text-2xl`, tighten spacing

**FeaturesGrid:**
- Change mobile grid from `grid-cols-1` to `grid-cols-2` with compact cards
- Reduce image height on mobile, smaller padding

**BeforeAfter:**
- ROI stat cards: `grid-cols-1` on mobile → `grid-cols-3` on `sm:`
- Cards stack properly on mobile already ✓

**HowItWorks:**
- Steps already stack on mobile ✓, reduce step image size on mobile

**DashboardPreview:**
- Hide sidebar completely on mobile (too narrow)
- Reduce stats grid to `grid-cols-2` on mobile ✓

**Specialties:**
- Change from `grid-cols-2` to `grid-cols-3` on small mobile for compactness, `grid-cols-5` on desktop
- Reduce icon/padding sizes

**PricingSection:**
- Cards stack 1-col on mobile ✓
- Comparison table: add horizontal scroll wrapper

**Testimonials:**
- Change to `grid-cols-1` on mobile, `grid-cols-2` on `sm:`, `grid-cols-3` on `lg:`
- Already has this ✓ — just tighten card padding

**FAQ:**
- Already full-width ✓

**ContactSection:**
- Stack form below contact info on mobile ✓

**LandingFooter:**
- Grid: `grid-cols-2` on mobile with brand spanning full width, `grid-cols-5` on `md:`

**MediaLogos:**
- Reduce gap and logo pill sizes on mobile

### 3. General UI Polish

- Tighten section padding on mobile: `py-10` instead of `py-14`
- Consistent `px-4` on all containers
- Ensure no element causes horizontal overflow (check all absolute positioned decorative elements have `overflow-hidden` parent)

### File Changes

| File | Changes |
|------|---------|
| `LandingNavbar.tsx` | Remove tagline span, frosted glass bg with blur effect |
| `LandingHero.tsx` | Show hero image on mobile (smaller), hide floating cards on xs, tighter spacing |
| `FeaturesGrid.tsx` | `grid-cols-2` on mobile, compact card sizing |
| `Specialties.tsx` | `grid-cols-3` on mobile, smaller icons |
| `Testimonials.tsx` | Tighter mobile padding |
| `PricingSection.tsx` | Mobile table scroll fix |
| `DashboardPreview.tsx` | Hide sidebar on mobile |
| `MediaLogos.tsx` | Smaller pills on mobile |
| `LandingFooter.tsx` | Better mobile grid |
| `BeforeAfter.tsx` | Compact ROI cards on mobile |
| `HowItWorks.tsx` | Smaller step images on mobile |
| `ContactSection.tsx` | Tighter mobile spacing |
| `TrustBar.tsx` | Smaller text on mobile |

### Build Order
1. Fix header (remove tagline, frosted glass blur)
2. Fix hero mobile layout
3. Fix FeaturesGrid mobile 2-col
4. Polish all remaining sections for mobile compactness
5. Final overflow check

