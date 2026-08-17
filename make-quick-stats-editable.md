# Feature: Make "Quick Stats" Section Editable in My Website Module

## Problem
On the admin panel's **My Website** page (`/admin/my-website` or similar — the website builder/customizer), the **Quick Stats** section (the 4 stat cards on the doctor's public hero: "5,000+ Patients Treated," "15+ Years Experience," "98% Success Rate," "24/7 Online Booking") currently only has an on/off visibility toggle. Its description reads "Stats are pulled from your profile data," implying these are computed/fixed values with **no way for the doctor to actually edit them** — unlike the **Services** section directly below it, which already has full inline editing (per-item toggle, drag handle, label, description, price, type, duration fields).

The doctor should be able to edit these stat values directly from this module, the same way they can already edit Services.

## Task
1. **Locate the Quick Stats section component** in the My Website builder (find the file backing this collapsible section, likely near wherever the Services section editor lives, given they're adjacent in the same page).
2. **Determine current data source for each stat:**
   - Check whether any of the 4 stats are currently computed from real data (e.g. "Years Experience" might already pull from a `profiles.years_experience` field set during onboarding) versus which are just hardcoded placeholder defaults (e.g. "5,000+ Patients Treated" and "98% Success Rate" look like generic marketing placeholders unlikely to be computed from anything real for a new doctor).
   - This matters for the UI/UX decision below — don't guess, check the actual code path that renders these values on the public page.
3. **Add editable fields for each of the 4 stats**, matching the Services section's existing editing pattern for consistency (inline text inputs, live preview update on the right panel, `Save` button at the top applies changes). For each stat card, at minimum:
   - **Label** (e.g. "Patients Treated") — editable text.
   - **Value** (e.g. "5,000+") — editable text (keep as free text rather than a strict number input, since values include suffixes like "+", "%", "/7" — e.g. "24/7").
   - Consider whether the **icon** per stat should also be editable/selectable (Services doesn't have icons to compare against, so use judgment — a small fixed set of relevant icon choices via a simple picker is reasonable if not too much extra scope; otherwise leave icons fixed per stat position and just make label/value editable, noting this as a scoping decision).
4. **For any stat that's currently computed from real profile data** (e.g. if Years Experience really is pulled from onboarding data): decide whether to (a) let the doctor override it with a manual value while still defaulting to the computed one if left blank, or (b) make it fully manual once this feature ships. Recommend (a) — default to computed value, but allow manual override — so accurate data isn't lost for doctors who don't bother to edit, while still giving control to those who want custom copy (e.g. a doctor might want "10,000+ Patients Treated" to sound more impressive than a literal, smaller real count). Flag this choice in the PR rather than silently picking one.
5. **Per-stat visibility toggle:** consider whether each individual stat card should be independently toggleable (show/hide just "Success Rate" while keeping the other 3), in addition to the existing whole-section toggle — check if Services has per-item toggles (it does, per the screenshot) and mirror that same granularity here for consistency, unless there's a good reason not to.
6. **Persistence:** confirm/add the necessary schema field(s) to store custom stat values (likely a JSON column on whatever table backs website customization settings, e.g. `profiles.website_settings` or a dedicated table — check existing patterns used for Services' storage and follow the same approach rather than introducing a new storage mechanism).

## Acceptance Criteria
- [ ] Each of the 4 Quick Stats cards has editable Label and Value fields in the My Website builder.
- [ ] Editing updates the live preview panel immediately (or on the existing Save flow, consistent with how Services already behaves).
- [ ] Changes persist and correctly reflect on the doctor's actual public page after Save.
- [ ] Decision made (and noted) on whether computed stats (if any) default-populate with an override option, or become fully manual.
- [ ] Per-stat visibility toggles added if consistent with the Services section's existing per-item toggle pattern.
- [ ] No regression to doctors who haven't touched this section yet — existing default values continue to display correctly until a doctor explicitly edits them.
