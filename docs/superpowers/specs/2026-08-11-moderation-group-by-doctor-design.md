# Superadmin Moderation — Group by Doctor — Design

## Problem

`SAModeration.tsx`'s Blog Posts and Reviews tabs each render one flat table of every doctor's items mixed together, ordered only by date. With multiple doctors publishing multiple posts (one doctor already has 5), the flat list is hard to scan — there's no way to see "what has this doctor posted" without hunting through the whole list.

## Goals

- Group both tabs' items by doctor, one card per doctor, collapsed by default.
- Each doctor's card shows name, clinic, and an item count; expands on click to reveal that doctor's individual items.
- Per-item display and moderation actions (publish/unpublish, hide/show, detail dialog) are unchanged — this is a grouping/display change only.
- Doctor cards ordered by their most recently active item first (per tab, independently).

## Non-goals

- No new search/filter — neither tab has one today, so none is being preserved or added.
- No change to `blog_posts`/`reviews` RLS, schema, or the moderation actions' own logic (`setPublished`, `toggleReview`) — only how results are queried (add `clinic_name`) and rendered.
- No change to the per-post detail `Dialog` (title, excerpt, content, publish toggle) — it keeps working exactly as it does today, just triggered from a row nested inside a doctor's card instead of a flat table.

## Architecture

**Shared local component** — `DoctorGroupCard`, defined once inside `SAModeration.tsx` (used only here, on two tabs; not extracted to a separate file since it isn't reused elsewhere — YAGNI). Props: `doctorName: string`, `clinicName: string | null`, `count: number`, `itemLabel: string` (`"post"`/`"review"`, for the `"N posts"` / `"N reviews"` count text), `children: ReactNode` (the table for that doctor's items). Renders a `Card` whose `CardHeader` is a `CollapsibleTrigger` (name, clinic, count badge, chevron that flips on open state) wrapping a `Collapsible`; `CardContent` (holding `children`) is the `CollapsibleContent`, so nothing under a collapsed card is even in the DOM until expanded. Each card manages its own open/closed state independently (`useState` inside `DoctorGroupCard`, not lifted) — collapsed by default, no "only one open at a time" accordion constraint, since the acceptance criteria only asks for independent expand/collapse per doctor.

**Grouping helper** — a small pure function (or inline `useMemo`), given a flat array of items each with a `doctor_id` and a joined `profiles` object, returns doctor groups sorted by that doctor's most recent item's `created_at` descending, with each group's items already sorted newest-first internally. Used identically for `posts` and `reviews` (same shape: both have `doctor_id`, `created_at`, and a joined `profiles:doctor_id(full_name, clinic_name)`), so this is one generic helper, not two copies.

**Data** — `load()`'s two `select(...)` calls both change `profiles:doctor_id(full_name)` to `profiles:doctor_id(full_name, clinic_name)`. No other query change; grouping happens client-side on the already-fetched flat arrays, same as today's plain `.map()`.

**Blog Posts tab** — replace the single `<table>` with: for each doctor group (from the grouping helper over `posts`), a `DoctorGroupCard` (`itemLabel="post"`) whose children is a `<table>` containing exactly that doctor's rows — same columns, same `onClick={() => setOpenPost(p)}` row behavior, same Publish/Unpublish button — as the current flat table's `<tbody>` today, just scoped to one doctor's posts instead of all of them.

**Reviews tab** — same structure: for each doctor group over `reviews`, a `DoctorGroupCard` (`itemLabel="review"`) whose children is that doctor's review rows, identical columns/Hide-Show button to today.

**Empty states** — "No posts." / "No reviews." (today's exact copy) shown when the respective flat array is empty, before any grouping — unchanged from today, just checked before rendering the group list instead of before rendering `<tbody>`.

## Error handling

- A post/review with no matching `profiles` row (shouldn't happen given the FK, but defensively — mirrors the existing `p.profiles?.full_name || "—"` fallback already in this file): grouped under a "—" doctor-name card rather than dropped, using its `doctor_id` as the group key so it doesn't silently disappear.

## Testing

- Unit test for the grouping helper: given a flat list with 2 doctors and mixed dates, returns groups ordered by each doctor's most recent item, each group's items internally newest-first.
- Component test for `DoctorGroupCard`: renders collapsed by default (children/table not in the DOM), expands to show children on clicking the header, shows the correct count text.
- Existing manual behavior (no automated test currently covers `SAModeration.tsx`) — verify by loading `/superadmin/moderation`, confirming both tabs show one card per doctor with correct counts, expand/collapse works, and Publish/Unpublish and Hide/Show still work exactly as before from within an expanded card.
