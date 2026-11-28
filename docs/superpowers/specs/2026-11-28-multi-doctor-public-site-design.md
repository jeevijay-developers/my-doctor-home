# Multi-doctor public site: clinic-first redesign

Date: 2026-11-28. Status: PLAN (nothing built yet). Builds on `2026-11-25-multi-doctor-clinic-design.md`.

## 1. What exists today (verified by reading the code)

- Routes: `/dr/:slug` (clinic), `/dr/:slug/doctor/:doctorSlug` (per-doctor page, simplified layout), `/blog`, `/blog/:post`, `/manage`, `/queue`.
- "Multi-doctor" on the client = 2+ *bookable* practitioners; on the edge/SEO/sitemap = 2+ *active* practitioners (inconsistent, see risk R9).
- Clinic page already has: "Choose your doctor" cards, a Doctor step in booking, per-doctor hours/slots/fees, "Offered by" labels on services, per-doctor review labels, blog author by practitioner.
- Clinic URL slug = `directory_slugify(owner full_name)`, never the clinic name. No slug input anywhere; it only re-derives when the owner's name changes. Old slugs are archived in `slug_history` by the browser.

## 2. Problems to fix (single-doctor assumptions)

| Area | Problem |
|---|---|
| URL | Slug comes from the owner's personal name |
| Navbar, hero, About, footer | Show the OWNER (name, photo, credentials, bio) even in a team clinic. "Meet Dr. Yash Jangid" |
| Doctor cards | No link to the doctor's page; page is reachable only from sitemap/blog bylines |
| Doctor page | Own stripped layout (no navbar, services, articles); thin crawler HTML |
| Services/Reviews/Blog | Clinic-wide lists, no per-doctor filtering on the clinic page; blog post page still shows owner avatar, "About {owner}", "More from {owner}"; "Written by the doctor" |
| Booking | No `?doctor=` deep link; no next-available per doctor; no "any doctor" |
| Contact form | No doctor choice |
| SEO | Title/description/JSON-LD name = owner; crawler body lists no doctors; breadcrumb points to redirected hub pages; og:image = owner photo; `/queue`, `/manage` indexable with canonical "/" |
| Redirects | Old slug 404s for `/blog`, `/manage`, `/queue`, edge `/doctor/` and `/blog`; history written by browser, fails silently for staff, no reserved words, no check against another clinic's old slug |

## 3. Decisions

### D1. URL
- Keep the `/dr/` prefix: `doctylia.com/dr/<clinic-slug>`. Dropping it risks collisions with top-level routes and is a far bigger migration. Doctor pages: `/dr/<clinic-slug>/doctor/<doctor-slug>` (unchanged).
- Clinic slug = slugified `clinic_name`; on collision append city, then `-2`, `-3` (never random characters). Latin transliteration fallback; if empty use `clinic`.
- Owner edits it in Settings ("Website address") with live availability check; length 3-50; reserved words refused.
- **Automatic when the 2nd doctor is added** (owner decision, replaces the earlier opt-in banner). When a clinic with a clinic name and an unlocked address gets its 2nd ACTIVE doctor (or later gets a name while already a team), a database trigger (`apply_team_clinic_address`, migration `20261128130000_auto_clinic_address.sql`) switches the address to the clinic-name slug once, sets `slug_locked`, archives the old slug in `slug_history` and notifies the owner. It never reverts (deactivating doctors, a 3rd doctor or renaming the clinic leave it alone) and a failure there can never block adding a doctor. Existing links, QR codes and prints keep working forever through redirects. Settings shows a read-only "Website address" card; there is no manual edit and no banner.
- Single-doctor clinics are untouched (doctor-name URL stays valid).

### D2. Redirects (shared, permanent)
- Slug rules in the database, not the browser: `BEFORE UPDATE OF slug` trigger writes `slug_history` (works for owner AND staff, atomic); format/reserved/length check; refuse a slug that is another clinic's old slug.
- One resolver (`resolve_clinic_slug(slug)` RPC, anon) used by every lookup: SPA pages (manage, queue, blog, post, doctor) and the edge (`doctor`, `practitioner`, `blog`, `post`) answering 301 that keeps the path suffix and query.
- History rows are never deleted.

### D3. Site layout when the clinic has 2+ active doctors (single-doctor layout unchanged)
Order: Navbar > Clinic hero > Doctors > About the clinic > Services > Gallery > Booking > Reviews > Articles > Clinic details & hours > Contact > Footer.
- **Navbar:** clinic name/logo, links Doctors, Services, Reviews, Articles, Contact; Book appointment.
- **Hero:** clinic name as H1, specialties line, city, aggregate rating, "N doctors", clinic photo (`hero_photo_url`) or a team collage of doctor photos; trust facts at clinic level (doctor count, longest experience, rating, specialties) never the owner's credentials. Two CTAs: Book appointment, Meet our doctors.
- **Doctors section:** moved right after the hero. Card = photo (initials fallback), name, specialty, qualifications, experience, short bio (2 lines), fee, next available slot, rating, buttons "View profile" and "Book". Specialty filter from 4 doctors, search from 9. Grid adapts 2/3/4 columns.
- **About the clinic** replaces "Meet Dr X": clinic story and photo from website settings. Each doctor's own About lives on their profile page and in the card.
- **Services:** clinic list, chips "Offered by …", filter by doctor.
- **Reviews:** aggregate + tabs All / per doctor / Clinic; review form asks which doctor.
- **Articles:** title "Health articles" (not "Written by the doctor"); author chips; per-post author avatar/byline of the actual doctor.
- **Hours:** "Clinic open" window plus a per-doctor weekly table.
- **Contact form:** optional "Who would you like to consult?".
- **Footer/manage/queue titles:** clinic name.

### D4. Doctor profile page (`/dr/:slug/doctor/:doctorSlug`) in the full site shell
Navbar + profile header (large photo, name, specialty, qualifications, experience, registration, languages later, rating) + About (full bio) + "Services by Dr X" + their hours + their reviews + articles by them + Book (preselected) + other doctors strip + clinic address/map. Unique per doctor, indexable only when it has real content (bio, see SEO).

### D5. Booking
- `?doctor=<slug>` deep link preselects; "Book" on cards and profile pages uses it.
- Next-available slot per doctor on cards and in the picker (one RPC for all doctors, not N calls).
- **No "First available doctor" option (owner decision 2026-11-28):** the patient always picks a doctor, as today. Next-available per doctor on the cards helps them choose.

### Owner decisions (2026-11-28)
- URL switch is **automatic** when the 2nd active doctor is added (D1); Settings "Website address" is a read-only card. No banner.
- Booking keeps the explicit doctor pick.

### D6. Profile management
- Owner (Settings), multi-doctor mode: two clear cards. "Clinic" (name, website address, address, phone, logo, about, hours) and "My doctor profile" (personal). Doctors page: per-doctor "Public page" link and a completeness chip (photo, bio, specialty, fee) with a warning that an empty profile makes a thin, unindexed page.
- Doctor login: `MyDoctorDetailsCard` gets "View my public page", live preview and a completeness checklist; still edits only bio/photo/signature (existing RPC).
- Reception with `profile.edit`: slug changes now recorded by the trigger.

### D7. SEO
- Clinic page: title `{Clinic name} - {specialties} in {city} | Doctylia`; description names the clinic and doctor count; og:image = clinic hero/logo, not the owner's photo; `og:type=website`.
- JSON-LD: `MedicalClinic` with `name = clinic_name`, address, telephone, `openingHoursSpecification`, logo, and EMBEDDED minimal `Physician` members (name, url, specialty, image) instead of bare ids. Clinic-level `aggregateRating` omitted when per-doctor ratings are emitted on doctor nodes (self-serving rating rule); keep for single-doctor as today.
- Crawler body for the clinic page lists every doctor with a link to their page (internal linking), the services and hours.
- Doctor page crawler body: address, phone, services, fee, hours; breadcrumb uses clinic name; `noindex` until the doctor has a bio of at least 60 characters (or photo + specialty), thin-content guard.
- Breadcrumb: drop the hub crumbs while `DIRECTORY_HIDDEN` (they point at redirected URLs).
- `/queue`, `/manage`, `/rx/*`: `noindex` via response header; not in sitemap.
- Redirects 301 on the edge for old slugs for all kinds. Sitemap unchanged apart from new slug and `lastmod`.
- Inconsistency fix (R9): one shared definition of "multi-doctor" for client, edge, sitemap.
- Constraints kept: relative imports under `src/lib/seo`, region `syd1`, no `FAQPage`, bio escaped.

## 4. Edge cases to handle and test
1. Clinic with 2 doctors but one deactivated: falls back to single layout; that doctor's page 301s to clinic; removed from sitemap; posts/reviews by them stay, shown as the clinic's.
2. Two active doctors, one not bookable: listed with "Call the clinic", not pickable.
3. Owner is also a doctor: appears as a card like the others, not as the hero.
4. No `clinic_name`: fall back to the owner's name without a "Dr." duplicate.
5. Clinic renamed: slug does NOT change by itself (locked after the automatic switch).
6. Duplicate clinic names, non-Latin names, empty slug, reserved words, 50+ chars.
7. Staff renames slug (RLS) and concurrent rename (UNIQUE race): clear error.
8. Visitor on the old URL when the slug changes (realtime navigation keeps the suffix).
9. Printed QR / TV queue screen / bookmarks on the old slug keep working.
10. Many doctors (9+): filter + search + performance (one RPC for next-available).
11. Doctor with no photo/bio: initials, "Profile coming soon", noindex.
12. Same display name twice: slug `-2`; cards show specialty to tell them apart.
13. Reviews with NULL doctor (clinic), aggregates not double counting.
14. Dark mode, 17 px minimum text, 640 px single column, keyboard and screen reader, reduced motion.
15. A slow/failed doctors RPC: single-doctor page still works (existing behaviour kept).
16. Stale edge cache (up to 1 h + 7 d stale) after a rename: 301 for the old slug is cached too; accept, or shorten cache for redirects.

## 5. Phases (each shippable and tested)
1. **Foundation:** slug rules + history trigger + resolver RPC + clinic slug generator + Settings "Website address" + opt-in banner + redirects for every kind (SPA and edge). SQL tests.
2. **SEO:** clinic and doctor meta/JSON-LD/body, noindex rules, shared multi-doctor definition, breadcrumb fix, tests/golden updates.
3. **Clinic site redesign:** navbar, hero, doctors section, about-clinic, services/reviews/blog/contact/footer per D3.
4. **Doctor profile page** in the full shell + per-doctor blog/review/service views.
5. **Booking:** `?doctor=` deep link, next-available per doctor RPC (no first-available option).
6. **Profile management:** owner clinic vs personal split, completeness chips, doctor self preview.
7. **QA:** real-browser run (Playwright) at 360/768/1440, accessibility check, SEO validation (Rich Results rules, view-source), all tests + tsc.

## 6. Tools and review
Design: `ui-ux-pro-max`, `frontend-design-direction`, doctor-site rules in CLAUDE.md. Build: parallel subagents per phase with TDD. Review: `database-reviewer` (phase 1), `seo-specialist` (phase 2), `a11y-architect` (phases 3-4), `typescript-reviewer`. Verify visually with the Playwright MCP.
