# Doctor public site redesign — design spec

Date: 2026-11-24. Scope: `/dr/:slug` (`src/pages/DoctorPublicPage.tsx` and `src/components/doctor/*`), plus the shared Footer used by `/dr/:slug/blog*`.
Status: approved direction; implementation proceeds section by section.

## 1. Goal

A premium, editorial doctor website that a patient on a phone — possibly elderly, low-vision or unwell — can act on in seconds. The visual bar is "Awwwards-considered"; the product bar is **fewer taps for every patient task**, with booking as the primary conversion.

Non-goals: changing booking, queue, payment or patient business logic; changing Supabase queries, RLS or edge functions; changing other surfaces (landing, admin, superadmin).

## 2. Decisions taken

| # | Decision | Choice |
|---|---|---|
| D1 | Where tokens live | Scoped layer: `src/styles/doctor-site.css` defines `--ds-*` under `.doctor-site` (light + dark). `tailwind.config.ts` gains one additive `ds` color/font/easing namespace. `src/index.css` untouched. CLAUDE.md updated to record the exception. |
| D2 | Missing data | Hide it. No invented trust claims (no fallback doctor name, patient counts, years, 5.0 rating, ghost-written bio, "Quality Healthcare" badges). Layouts are designed to look intentional when sparse. |
| D3 | First-visit theme | Follow the device (`prefers-color-scheme`); keep the toggle; a saved choice wins. Implemented by passing `"system"` as the doctor page's default — `usePanelTheme` internals unchanged. |
| D4 | cal.com | Not the booking engine. Supabase stays source of truth. A later, separate spec adds calendar sync (confirmed appointments -> doctor's cal.com/Google calendar; busy times block slots). cal.com MCP is connected for that work. |
| D5 | Visual direction | "Editorial Warmth" (warm paper, ink, serif display, one royal accent) with two details borrowed from "Soft Precision": live open/closed pill and frosted bottom action bar. |

## 3. Design language

### 3.1 Color tokens (`--ds-*`, HSL in CSS, hex here for review)

| Token | Light | Dark | Use |
|---|---|---|---|
| `paper` | `#FAF7F2` | `#0E1420` | page background |
| `paper-2` | `#F3EEE6` | `#121A28` | alternate section band |
| `surface` | `#FFFFFF` | `#172133` | cards, sheets, inputs |
| `ink` | `#14213D` | `#F3EFE8` | headings, body |
| `ink-2` | `#475266` | `#C4C9D4` | secondary text |
| `ink-3` | `#626B7C` | `#9AA3B2` | meta (dates, captions) |
| `line` | `#E4DCCF` | `#26314A` | hairlines, borders |
| `accent` | `#1D4ED8` | `#2F5BEA` | primary action fill (white text) |
| `accent-ink` | `#1D4ED8` | `#8FB0FF` | accent text / links on paper |
| `accent-soft` | `#E7EDFC` | `#1A2747` | selected chips, soft fills |
| `live` | `#166534` | `#4ADE80` | "Open now" text; dot uses `#22C55E` |
| `warm` | `#92400E` | `#F5B454` | rating text; stars fill `#F59E0B` |
| `danger` | `#B91C1C` | `#F87171` | errors, "Closed" |

Contrast targets: body/ink on paper and surface >= 7:1; `ink-2` >= 4.5:1; `ink-3` >= 4.5:1 (meta text is still text); white on `accent` >= 4.5:1. A unit test computes these from the token file so a later edit cannot silently break them.

The doctor-site layer does **not** consume the global `bg-primary`/`text-teal` tokens; it uses `ds-*` utilities only. The scattered `#3C83FC` literals and the legacy `text-text-*` / `bg-surface-light` palette classes are replaced by `ds-*` utilities as each component is rebuilt. Class merging in doctor-site components uses `dsCn` (`src/components/doctor/ui/dsCn.ts`), because the global `cn`/tailwind-merge treats `text-ds-small` etc. as colors and drops them.

### 3.2 Typography

- Display: **Newsreader** (variable, opsz + wght), self-hosted from `@fontsource-variable/newsreader` and loaded only by the doctor-site stylesheet (CSP allows `'self'` fonts only). Used for H1/H2 and pull quotes, never for UI controls.
- Text/UI: **Inter** (already self-hosted). Plus Jakarta Sans is not used on the doctor site.
- Fluid scale (`clamp`, mobile -> desktop): display 2.5 -> 4.75rem (lh 1.02, tracking -0.02em) · h2 2 -> 3.25rem · h3 1.25 -> 1.5rem · lead 1.125 -> 1.25rem · body **1.0625rem (17px)**, lh 1.6 · small 0.9375rem · label 0.875rem (minimum text size anywhere: 14px).
- Numbers that change (prices, times, counts) use `tabular-nums`.

### 3.3 Space, shape, elevation

- 4px base; section rhythm 72px mobile / 128px desktop; content max 1200px; reading measure 62ch.
- Radii: `sm` 10px (chips, inputs) · `md` 16px (cards) · `lg` 28px (media, sheets) · pill.
- Elevation: three soft, warm-tinted shadows (`ds-1` resting card, `ds-2` raised/hover, `ds-3` sheet/bottom bar). No glow shadows in brand blue.
- Tap targets: minimum 48px high on mobile, 8px gaps. Focus ring: 3px `accent` outline + 2px paper offset, always visible on keyboard focus.

### 3.4 Motion tokens

| Token | Value | Use |
|---|---|---|
| `dur-1` | 160ms | press, hover color |
| `dur-2` | 240ms | chips, toggles, small reveals |
| `dur-3` | 420ms | cards, sheets, step changes |
| `dur-4` | 700ms | section reveals, hero kinetic type |
| `ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | entering |
| `ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | moving |
| spring | stiffness 420, damping 32 | buttons, cards, layout changes |

Rules:
1. Nothing blocks input. Every animation is interruptible; CTAs are clickable from first paint.
2. The LCP element (hero portrait) and the H1 are **never** rendered at `opacity: 0`. The H1 reveal uses a clip/translate mask starting within 100ms, and the text is in the DOM and visible to crawlers and screen readers throughout.
3. `prefers-reduced-motion: reduce` -> no Lenis, no scrubbed or parallax motion, no 3D; reveals become instant; state transitions keep a 120ms crossfade at most.
4. Exit is ~65% of enter duration. Stagger is 40ms per item, capped at 6 items.

## 4. Libraries — what each one is for

| Library | Used for | Not used for |
|---|---|---|
| `framer-motion` (v11, already in the app bundle) | All doctor-site UI motion: press/hover springs, magnetic primary CTA (fine pointers only), shared-layout nav pill and step transitions, sheet/bar entry, SVG check draw. **Standard for the doctor site.** *Decision changed during the build:* the spec first chose the `motion` package, but it ships its own nested copy of the runtime and, with `framer-motion` also in the app, added ~55 KB gzip to the shell of every route. The `motion` dependency is now unused here; removing it from package.json (or aligning versions) is left to the owner. | Scroll-linked storytelling |
| `gsap` + ScrollTrigger + SplitText | Hero and section-heading line reveals (the pinned storytelling sequence was dropped: it adds taps/scroll with no patient benefit). **Lazy async chunk** (`motion/gsap.ts` `loadGsap()`): the text is real DOM text from first paint and the reveal is a progressive enhancement that is skipped if it cannot start without a flash. Cleaned up with `gsap.context()`. | Buttons and form controls |
| `lenis` | Loaded at idle (own chunk). Weighted smooth scroll on the doctor page only, driven by GSAP's ticker so ScrollTrigger stays in sync. Disabled for reduced motion and on touch devices that already have native momentum (`syncTouch: false`). Booking slot lists, dialogs and drawers carry `data-lenis-prevent`. Anchor jumps (`#booking`) go through `lenis.scrollTo` with a short duration (<= 0.6s) so reaching the CTA is not slowed. | Admin/landing |
| `@react-three/fiber` + `three` (+ `drei`) | **Removed after measurement.** The hero accent was built (lazy, gated to capable desktops) but caused scroll jank: 29 frames over 33 ms and 5 over 50 ms in a 4x-CPU scroll test, versus 0 with it removed. The packages stay installed but unused here. | Anywhere on this page |
| shadcn/ui (existing `src/components/ui/*`) | Dialog, Drawer (vaul), Carousel (embla), RadioGroup, Tooltip, Accordion, ScrollArea — consumed, not edited. | — |
| Magic UI / Aceternity patterns | Pulled as source and adapted into `src/components/doctor/ui/*` (doctor-scoped, styled with `ds-*`): e.g. marquee for review ribbon, shine border for the quick-book card, number ticker. Not added to `components.json` and not to `src/components/ui`. | Shared surfaces |
| `@rive-app/react-canvas`, `unicornstudio-react` | **Not used in this pass.** Both need authored assets that do not exist (a `.riv` file; a Unicorn Studio scene id), and both load runtime code/data from third-party CDNs that the CSP in `vercel.json` blocks (`script-src`, `connect-src`). Revisit when assets exist; Rive's WASM can be self-hosted via `RuntimeLoader.setWasmUrl`. | — |

Bundle budget: doctor route JS increase <= 70 KB gzip before the lazy 3D chunk; 3D chunk <= 180 KB gzip and never on the critical path. Lighthouse mobile (Performance, Accessibility, Best Practices, SEO) must not regress from the pre-redesign baseline measured in the first verification step.

## 5. Page structure and section concepts

New order (each optional section still obeys its `website_settings.show_*` flag and hides when empty):

1. **Navbar** — slim, transparent over the hero, turns frosted paper after 24px of scroll. Left: portrait + name + specialty. Right: theme toggle, "My appointment" (text link desktop), menu (mobile). Desktop primary CTA "Book appointment" always visible; on mobile the bottom bar owns that job.
2. **Bottom action bar (mobile, new)** — fixed, frosted, safe-area aware, 56px: `Book appointment` (primary, wide) + `Call` + `WhatsApp` (if configured) icon buttons with labels. Hides while the booking section is on screen (it would be redundant) and while the keyboard is open. Desktop gets a compact floating "Book" pill after the hero leaves the viewport.
3. **Hero** — editorial split: serif headline (`hero_headline_line1/2`), eyebrow (specialty · locality), description, trust row built only from real data (experience years, rating + count when reviews exist, qualifications, registration no.), live status pill computed from `workingHours` (Open now · until X / Opens tomorrow at X / Closed today), and the **quick-book card** ("Next available: Today, 4:30 PM" -> one tap selects that slot in the booking widget). Portrait uses the exact preloaded URL (see §8). Secondary actions: Call, Directions.
4. **Services** — editorial list, not a carousel of equal cards: each row = name, type badge, duration, price, one "Book" affordance; the whole row is the tap target. More than 6 services -> "Show all" expands inline. Long descriptions expand inline (no dialog).
5. **About** — portrait/about photo with caption, serif pull quote only if the doctor wrote a description (otherwise omitted), credentials as a definition list (qualifications, registration, experience, languages if present).
6. **Booking** — §6.
7. **Reviews** — summary (average, count, distribution bar) + a calm horizontal ribbon of review cards; "Write a review" keeps the existing form (visual restyle only).
8. **Gallery** — editorial masonry with lightbox; no autoplay (autoplay moves content under a reading user).
9. **Health articles** — first post as a feature card + list of the next three; "All articles" link.
10. **Visit & contact** — clinic details and the question form merged into one section: map (still lazy), address with Directions, today's hours highlighted, weekly hours, Call/WhatsApp/Email actions, and "Ask a question" form inline (same fields and anti-spam as today; name, phone, message visible; email optional and collapsed).
11. **Footer** — compact: identity, explore links, contact, legal line, "Powered by Doctylia". Also used by blog pages (`profileOverride` contract preserved).

`OnlineConsultation.tsx` is not currently rendered; its content (online fee, duration, how it works) is folded into the booking type selector and a Services highlight when `hasFeature("online_consultation")` and `show_online_consultation` are true.

Section ids stay stable (`services`, `about`, `gallery`, `booking`, `reviews`, `blog`, `contact`) — Footer links and `#hash` deep links depend on them. The duplicated mobile/desktop DOM pattern (`md:hidden` + `hidden md:block` with `-desktop` ids) is dropped; one responsive tree per section, which also halves hero image work.

### 5.1 Responsive convention (doctor site only)

Mobile-first single column below 640px; editorial asymmetric 12-column grid from 1024px; image/text pairs sit side by side from 768px. This deliberately differs from the CLAUDE.md "side-by-side at every width" rule for marketing pages: at 375px with 17px minimum body text, side-by-side columns fall under ~20 characters per line, which fails the elderly/low-vision brief. CLAUDE.md is updated to record this exception.

## 6. Booking — friction removal (visual + UI flow only)

Business logic that does **not** change: slot generation, `useSlotAvailability` polling and re-validation, `createAppointmentRow`, Razorpay order/verify/retry/unconfirmed handling, error code handling, `doctylia:select-service` event, slip generation/download.

UI flow changes:
1. **One "When" screen** replaces steps 1–3: consultation type as a segmented control (hidden when only clinic is available), service as chips (preselected default or the service the patient tapped), a 2-row date strip with the **first open day with free slots preselected**, and that day's slots shown immediately. Tapping a slot runs the existing `selectTimeSlot` re-validation and advances.
2. **"Who" screen**: visible labels; name autofocused; phone with +91 adornment and inline validation on blur; age numeric keypad; **gender as three one-tap chips** (radio group); email and reason collapsed under "Add email or reason (optional)". Primary button states the outcome ("Confirm booking · ₹500" / "Continue to payment").
3. **Review & pay** (online payment only) unchanged in content, restyled.
4. **Done**: success screen without auto-opening the slip dialog; actions: Download slip, **Add to calendar** (client-generated `.ics`, no new dependency), Manage appointment, Book another.
5. **Quick-book**: hero card dispatches a new `doctylia:select-slot` event `{ date, time, type }`; the widget sets type/date and calls the same `selectTimeSlot`.
6. "Next available" is computed client-side by walking open days from `workingHours` (bounded by `booking_advance_days`) and asking the existing read-only `get_slot_counts` RPC per day until a free slot is found; it runs after first paint and caches per session.

Tap counts (mobile, pay at clinic, typing excluded):

| Path | Before | After |
|---|---|---|
| From hero, standard | 11 (CTA, type, date, time, 3 field taps, gender x2, submit, dismiss auto-opened slip) | 6 (CTA, slot, phone, age, gender chip, confirm; name autofocused, date preselected) |
| From hero, quick-book | — | 5 (Book this slot, phone, age, gender chip, confirm) |
| From mid-page | 12 (+ open hamburger, since the navbar CTA is hidden below 640px) | 6 (bottom bar) |
| Online payment | 13 + gateway | 7 + gateway |

## 7. Other flows — targets (verified by `ecc:click-path-audit` at the end)

| Task | Before (mobile) | Target |
|---|---|---|
| Call the clinic | 1 (hero) / scroll to contact | 1 from anywhere (bottom bar) |
| WhatsApp | 1 (floating button) | 1 from anywhere (bottom bar; floating button removed to avoid two overlapping fixed elements) |
| Today's hours | scroll to contact | 0 (hero live pill) |
| Directions | 1 (hero card, mobile only) | 1 (hero + visit section) |
| Read a review | scroll + carousel swipes | scroll; first 3 visible without swiping |
| Read an article | scroll + carousel | scroll + 1 |
| Ask a question | scroll + 3 fields + submit (email shown) | scroll + 3 fields + submit (email collapsed; errors inline on blur) — same taps, less on screen |
| Manage appointment | menu + link = 2 (mobile) | 2 on mobile (menu -> "My appointment"), 1 on desktop; also one link in the booking section and in the confirmation screen. *Not reduced on phones.* |

## 8. SEO and performance contract

- Crawler HTML comes from `api/seo.ts` -> `buildDoctorBody`; it is independent of the React tree and is not changed.
- The hero portrait must keep rendering `OptimizedImage` with `src={settings.hero_photo_url}`, `width={HERO_IMAGE_WIDTH}` and `fetchPriority="high"` so the URL matches the `<link rel="preload">` the Edge function injects. Exactly one hero `<img>` in the DOM.
- All copy stays real DOM text (no text in canvas/WebGL). The 3D accent is decorative (`aria-hidden`), behind content.
- JSON-LD and meta handling in `DoctorPublicPage` unchanged.
- Google Maps iframe stays lazy (near-viewport) as today.

## 9. Accessibility

WCAG 2.2 AA minimum; AAA contrast for body text. Skip link to main. One H1 (hero headline). Visible labels on every input; errors announced via `aria-live`; first invalid field focused on submit. Chips are real radio groups. Dialogs/drawers trap focus and restore it. Bottom bar does not cover content (page gets matching bottom padding) and respects `env(safe-area-inset-bottom)`. Everything works at 200% zoom and with reduced motion.

## 10. Testing and verification

- Colocated tests updated per component as it is rebuilt (`ServicesSection.test.tsx`, `BookingWidget*.test.tsx`, `slips.test.tsx`, `DoctorPublicPage.test.tsx`), plus new tests: token contrast, live-status computation, next-available computation, quick-book event, bottom-bar visibility, "missing data is hidden".
- After each section: `npm run lint`, `npx tsc --noEmit -p tsconfig.app.json`, `npx vitest run` (baseline before the redesign: 7 doctor test files / 59 tests passing after restoring `@testing-library/dom`).
- Browser: Playwright screenshots at 375 / 768 / 1280 / 1440, light + dark; console clean. Chrome DevTools Lighthouse (mobile) before/after; network weight and a performance trace after GSAP/Lenis/3D land.
- Agents: `ecc:react-reviewer` after every 2–3 sections; `ecc:performance-optimizer` after motion/3D; GAN generator/evaluator loop for Hero and Booking; `ecc:click-path-audit` and `web-design-guidelines` at the end.

## 11. Risks

- Hero photos of uneven quality across tenants -> portrait frame crops to a consistent aspect with a warm paper backdrop; initials monogram when absent.
- Lenis vs. nested scroll and Radix dialogs -> `data-lenis-prevent` on scroll areas, Lenis stopped while any dialog/drawer is open.
- Lovable sync: new files under `src/styles/` and `src/components/doctor/ui/` are plain source; nothing generated.

## 12. As built — results and deviations

Measured on a production build, mobile, Slow 4G + 4x CPU, against the pre-redesign commit (same session, same profile):

| | Before | After |
|---|---|---|
| LCP | 12.0 s | 9.9 s |
| CLS | 0.000 | 0.000 |
| Lighthouse a11y / best practices / SEO | 100 / 96 / 100 | 100 / 96 / 100 |
| JS in the shell (modulepreload, gzip) | 269.8 KB | 271.4 KB |
| 3D accent | n/a | removed (it caused scroll jank) |

Deviations from the plan above: `framer-motion` instead of `motion` (see §4); the Visit and Ask-a-question sections are two adjacent sections rather than one; `OnlineConsultation.tsx` and `SectionCard.tsx` were deleted (online consultation is a row in Services and a toggle in Booking); slot times display in 12-hour form and each part of the day shows 12 times with "Show all"; the booking wizard keeps its internal steps 1-5 but shows When / Your details / Review & pay.

Findings that need the owner (outside this page): the platform pre-fills every doctor with "5,000+ Patient Consultations" (column default + admin editor), which the site hides but does not remove; the booking widget charges a 500 default when neither a service price nor a consultation fee exists; `get_slot_counts` had drifted in the live database and was restored by migration `20261124100000`.

### Final section order (owner's instruction, supersedes §5's list)

Hero, About, Gallery, Services, Booking, Reviews, Articles, Clinic details & contact, Contact form, Footer. The navbar and footer links follow the same order. Services, Gallery and Articles stay visible whenever the doctor's switch is on, even with nothing added yet (Services lists the plain consultation from the doctor's real fee and slot length; Gallery and Articles show a short placeholder). Locked by a test in `src/pages/DoctorPublicPage.test.tsx`.
