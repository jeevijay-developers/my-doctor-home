# Moderation Group-by-Doctor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group `SAModeration.tsx`'s Blog Posts and Reviews tabs by doctor — one collapsed-by-default `Card` per doctor (name, clinic, item count), expanding to reveal that doctor's items with all existing per-item info/actions unchanged.

**Architecture:** A pure `groupByDoctor()` helper (generic over posts and reviews, same shape: `doctor_id` + `created_at` + joined `profiles`) groups and sorts a flat array into per-doctor groups, most-recently-active doctor first. A local `DoctorGroupCard` component (exported from `SAModeration.tsx`, not a separate file — used only here) renders one `Card` per group with a `Collapsible` header/content. Both tabs reuse the same helper and card component; only the table rows inside stay tab-specific.

**Tech Stack:** React + TypeScript, shadcn `Card`/`Collapsible` (already in the codebase, `Collapsible` previously used once), `lucide-react` (`ChevronDown`), Vitest + Testing Library.

## Global Constraints

- No new query beyond adding `clinic_name` to the existing `profiles:doctor_id(...)` selects — grouping is client-side.
- No change to `setPublished`/`toggleReview` logic, the detail `Dialog`, or any RLS/schema.
- No new search/filter — neither tab has one today.
- `DoctorGroupCard` stays defined inside `SAModeration.tsx` (exported as a named export for testability), not extracted to its own file — it isn't reused elsewhere.

---

### Task 1: `groupByDoctor` helper

**Files:**
- Create: `src/lib/groupByDoctor.ts`
- Test: `src/lib/groupByDoctor.test.ts`

**Interfaces:**
- Produces: `interface DoctorGroup<T> { doctorId: string; doctorName: string; clinicName: string | null; items: T[] }` and `function groupByDoctor<T extends { doctor_id: string; created_at: string; profiles?: { full_name?: string | null; clinic_name?: string | null } | null }>(items: T[]): DoctorGroup<T>[]`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/groupByDoctor.test.ts
import { describe, it, expect } from "vitest";
import { groupByDoctor } from "./groupByDoctor";

type Item = { id: string; doctor_id: string; created_at: string; profiles: { full_name: string; clinic_name: string | null } | null };

describe("groupByDoctor", () => {
  it("groups items by doctor_id, sorting groups by most-recent item and items within a group newest-first", () => {
    const items: Item[] = [
      { id: "p1", doctor_id: "d1", created_at: "2026-08-01", profiles: { full_name: "Dr. A", clinic_name: "A Clinic" } },
      { id: "p2", doctor_id: "d1", created_at: "2026-08-05", profiles: { full_name: "Dr. A", clinic_name: "A Clinic" } },
      { id: "p3", doctor_id: "d2", created_at: "2026-08-10", profiles: { full_name: "Dr. B", clinic_name: "B Clinic" } },
    ];
    const groups = groupByDoctor(items);
    expect(groups.map((g) => g.doctorId)).toEqual(["d2", "d1"]);
    expect(groups[1].items.map((i) => i.id)).toEqual(["p2", "p1"]);
    expect(groups[0]).toMatchObject({ doctorName: "Dr. B", clinicName: "B Clinic" });
  });

  it("falls back to a placeholder name for a missing profiles join instead of dropping the item", () => {
    const items: Item[] = [{ id: "p1", doctor_id: "d1", created_at: "2026-08-01", profiles: null }];
    const groups = groupByDoctor(items);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ doctorName: "—", clinicName: null });
  });

  it("returns an empty array for an empty input", () => {
    expect(groupByDoctor([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/groupByDoctor.test.ts`
Expected: FAIL — cannot find module `./groupByDoctor`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/groupByDoctor.ts
export interface DoctorGroup<T> {
  doctorId: string;
  doctorName: string;
  clinicName: string | null;
  items: T[];
}

interface GroupableItem {
  doctor_id: string;
  created_at: string;
  profiles?: { full_name?: string | null; clinic_name?: string | null } | null;
}

export function groupByDoctor<T extends GroupableItem>(items: T[]): DoctorGroup<T>[] {
  const groups = new Map<string, DoctorGroup<T>>();

  for (const item of items) {
    const id = item.doctor_id;
    let group = groups.get(id);
    if (!group) {
      group = {
        doctorId: id,
        doctorName: item.profiles?.full_name || "—",
        clinicName: item.profiles?.clinic_name ?? null,
        items: [],
      };
      groups.set(id, group);
    }
    group.items.push(item);
  }

  const result = Array.from(groups.values());
  for (const group of result) {
    group.items.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  }
  result.sort((a, b) => (b.items[0]?.created_at || "").localeCompare(a.items[0]?.created_at || ""));

  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/groupByDoctor.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/groupByDoctor.ts src/lib/groupByDoctor.test.ts
git commit -m "feat: add groupByDoctor helper for moderation blog/review grouping"
```

---

### Task 2: Group both tabs in `SAModeration.tsx`

**Files:**
- Modify: `src/components/superadmin/SAModeration.tsx`
- Test: `src/components/superadmin/SAModeration.test.tsx`

**Interfaces:**
- Consumes: `groupByDoctor` from `@/lib/groupByDoctor` (Task 1).
- Produces: `export const DoctorGroupCard` (named export alongside the existing default export), props `{ doctorName: string; clinicName: string | null; count: number; itemLabel: string; children: React.ReactNode }`.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/superadmin/SAModeration.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SAModeration from "./SAModeration";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/lib/adminAudit", () => ({ logAdminAction: vi.fn() }));

const posts = [
  { id: "p1", title: "Post A1", doctor_id: "d1", is_published: true, created_at: "2026-08-01", profiles: { full_name: "Dr. A", clinic_name: "A Clinic" } },
  { id: "p2", title: "Post A2", doctor_id: "d1", is_published: false, created_at: "2026-08-05", profiles: { full_name: "Dr. A", clinic_name: "A Clinic" } },
  { id: "p3", title: "Post B1", doctor_id: "d2", is_published: true, created_at: "2026-08-10", profiles: { full_name: "Dr. B", clinic_name: "B Clinic" } },
];
const reviews = [
  { id: "r1", patient_name: "Pat A", doctor_id: "d1", rating: 5, review_text: "Great", is_visible: true, created_at: "2026-08-02", profiles: { full_name: "Dr. A", clinic_name: "A Clinic" } },
];

const mockData = () => {
  const chain = (resolved: any): any => ({ select: () => chain(resolved), order: () => Promise.resolve(resolved) });
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === "blog_posts") return chain({ data: posts });
    if (table === "reviews") return chain({ data: reviews });
    return chain({ data: [] });
  });
};

describe("SAModeration blog grouping", () => {
  it("shows one collapsed card per doctor with the correct post count, posts hidden until expanded", async () => {
    mockData();
    render(<SAModeration />);
    expect(await screen.findByText("Dr. A")).toBeInTheDocument();
    expect(screen.getByText("Dr. B")).toBeInTheDocument();
    expect(screen.getByText(/2 posts/i)).toBeInTheDocument();
    expect(screen.getByText(/1 post\b/i)).toBeInTheDocument();
    expect(screen.queryByText("Post A1")).not.toBeInTheDocument();
    expect(screen.queryByText("Post B1")).not.toBeInTheDocument();
  });

  it("expands a doctor's card on click to reveal their posts", async () => {
    mockData();
    render(<SAModeration />);
    const drACard = await screen.findByText("Dr. A");
    fireEvent.click(drACard);
    expect(await screen.findByText("Post A1")).toBeInTheDocument();
    expect(await screen.findByText("Post A2")).toBeInTheDocument();
    expect(screen.queryByText("Post B1")).not.toBeInTheDocument();
  });

  it("orders doctor cards by most recent post first", async () => {
    mockData();
    render(<SAModeration />);
    await screen.findByText("Dr. A");
    const names = screen.getAllByText(/^Dr\. [AB]$/).map((el) => el.textContent);
    expect(names).toEqual(["Dr. B", "Dr. A"]);
  });

  it("groups reviews into one collapsed card per doctor", async () => {
    mockData();
    render(<SAModeration />);
    fireEvent.click(screen.getByRole("tab", { name: /reviews/i }));
    expect(await screen.findByText("Dr. A")).toBeInTheDocument();
    expect(screen.getByText(/1 review\b/i)).toBeInTheDocument();
    expect(screen.queryByText("Pat A")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/superadmin/SAModeration.test.tsx`
Expected: FAIL — current implementation renders a flat table, not grouped cards; `DoctorGroupCard` doesn't exist.

- [ ] **Step 3: Write the implementation**

Replace the full contents of `src/components/superadmin/SAModeration.tsx`:

```tsx
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { logAdminAction } from "@/lib/adminAudit";
import { groupByDoctor } from "@/lib/groupByDoctor";

export const DoctorGroupCard = ({ doctorName, clinicName, count, itemLabel, children }: {
  doctorName: string; clinicName: string | null; count: number; itemLabel: string; children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="flex-row items-center justify-between gap-3 p-4 cursor-pointer select-none hover:bg-secondary/40">
            <div>
              <CardTitle className="text-sm font-semibold">{doctorName}</CardTitle>
              <div className="text-xs text-muted-foreground mt-0.5">
                {clinicName || "—"} · {count} {itemLabel}{count === 1 ? "" : "s"}
              </div>
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`} />
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="p-0 overflow-x-auto">{children}</CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

const SAModeration = () => {
  const [posts, setPosts] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [openPost, setOpenPost] = useState<any | null>(null);

  const load = async () => {
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from("blog_posts").select("*, profiles:doctor_id(full_name, clinic_name)").order("created_at", { ascending: false }),
      supabase.from("reviews").select("*, profiles:doctor_id(full_name, clinic_name)").order("created_at", { ascending: false }),
    ]);
    setPosts(p ?? []);
    setReviews(r ?? []);
  };
  useEffect(() => { load(); }, []);

  const setPublished = async (id: string, next: boolean) => {
    const { error } = await supabase.from("blog_posts").update({ is_published: next }).eq("id", id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    await logAdminAction(next ? "publish_blog_post" : "unpublish_blog_post", "blog_posts", id);
    toast({ title: next ? "Post published" : "Post unpublished" });
    if (openPost?.id === id) setOpenPost({ ...openPost, is_published: next });
    load();
  };

  const toggleReview = async (id: string, next: boolean) => {
    const { error } = await supabase.from("reviews").update({ is_visible: next }).eq("id", id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    await logAdminAction(next ? "show_review" : "hide_review", "reviews", id);
    toast({ title: next ? "Review restored" : "Review hidden" });
    load();
  };

  const postGroups = groupByDoctor(posts);
  const reviewGroups = groupByDoctor(reviews);

  return (
    <Tabs defaultValue="blogs">
      <TabsList>
        <TabsTrigger value="blogs">Blog Posts</TabsTrigger>
        <TabsTrigger value="reviews">Reviews</TabsTrigger>
      </TabsList>

      <TabsContent value="blogs" className="space-y-3">
        {postGroups.length === 0 ? (
          <Card><CardContent className="p-6 text-center text-muted-foreground">No posts.</CardContent></Card>
        ) : (
          postGroups.map((group) => (
            <DoctorGroupCard key={group.doctorId} doctorName={group.doctorName} clinicName={group.clinicName} count={group.items.length} itemLabel="post">
              <table className="w-full text-sm">
                <thead className="bg-secondary text-xs uppercase text-muted-foreground">
                  <tr><th className="text-left p-3">Title</th><th className="text-left p-3">Status</th><th className="text-left p-3">Date</th><th className="p-3"></th></tr>
                </thead>
                <tbody>
                  {group.items.map((p) => (
                    <tr key={p.id} className="border-t cursor-pointer hover:bg-secondary/40" onClick={() => setOpenPost(p)}>
                      <td className="p-3 font-medium">{p.title}</td>
                      <td className="p-3">
                        <Badge variant={p.is_published ? "default" : "outline"} className="pointer-events-none">
                          {p.is_published ? "Published" : "Draft"}
                        </Badge>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</td>
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        {p.is_published
                          ? <Button size="sm" variant="destructive" onClick={() => setPublished(p.id, false)}>Unpublish</Button>
                          : <Button size="sm" onClick={() => setPublished(p.id, true)}>Publish</Button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DoctorGroupCard>
          ))
        )}
      </TabsContent>

      <TabsContent value="reviews" className="space-y-3">
        {reviewGroups.length === 0 ? (
          <Card><CardContent className="p-6 text-center text-muted-foreground">No reviews.</CardContent></Card>
        ) : (
          reviewGroups.map((group) => (
            <DoctorGroupCard key={group.doctorId} doctorName={group.doctorName} clinicName={group.clinicName} count={group.items.length} itemLabel="review">
              <table className="w-full text-sm">
                <thead className="bg-secondary text-xs uppercase text-muted-foreground">
                  <tr><th className="text-left p-3">Patient</th><th className="text-left p-3">Rating</th><th className="text-left p-3">Text</th><th className="text-left p-3">Visible</th><th className="p-3"></th></tr>
                </thead>
                <tbody>
                  {group.items.map((r) => (
                    <tr key={r.id} className="border-t align-top">
                      <td className="p-3">{r.patient_name}</td>
                      <td className="p-3">{r.rating}★</td>
                      <td className="p-3 text-xs max-w-xs">{r.review_text}</td>
                      <td className="p-3"><Badge variant={r.is_visible ? "default" : "outline"} className="pointer-events-none">{r.is_visible ? "Yes" : "Hidden"}</Badge></td>
                      <td className="p-3">
                        <Button size="sm" variant={r.is_visible ? "destructive" : "default"} onClick={() => toggleReview(r.id, !r.is_visible)}>
                          {r.is_visible ? "Hide" : "Show"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DoctorGroupCard>
          ))
        )}
      </TabsContent>

      <Dialog open={!!openPost} onOpenChange={(v) => !v && setOpenPost(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {openPost && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">{openPost.title}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant={openPost.is_published ? "default" : "outline"} className="pointer-events-none">
                  {openPost.is_published ? "Published" : "Draft"}
                </Badge>
                {openPost.category && <Badge variant="outline" className="pointer-events-none">{openPost.category}</Badge>}
                <span>By {openPost.profiles?.full_name || "—"}</span>
                <span>·</span>
                <span>{new Date(openPost.published_at || openPost.created_at).toLocaleDateString()}</span>
              </div>
              {openPost.featured_image_url && (
                <img src={openPost.featured_image_url} alt={openPost.title} className="w-full rounded-lg max-h-64 object-cover" />
              )}
              {openPost.excerpt && (
                <p className="text-sm font-medium text-muted-foreground italic">{openPost.excerpt}</p>
              )}
              <div
                className="prose prose-sm max-w-none text-foreground"
                dangerouslySetInnerHTML={{ __html: openPost.content || "<p class='text-muted-foreground'>No content.</p>" }}
              />
              <DialogFooter>
                {openPost.is_published
                  ? <Button variant="destructive" onClick={() => setPublished(openPost.id, false)}>Unpublish</Button>
                  : <Button onClick={() => setPublished(openPost.id, true)}>Publish</Button>}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Tabs>
  );
};

export default SAModeration;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/superadmin/SAModeration.test.tsx`
Expected: PASS (4 tests). If clicking the `CardHeader`/`CollapsibleTrigger` doesn't toggle in jsdom, try firing the click on the returned element directly (Radix `Collapsible`'s trigger responds to plain click, unlike `Tabs`' focus-based activation seen elsewhere in this codebase — no `.focus()` call should be needed here, but verify against actual test output rather than assuming).

- [ ] **Step 5: Run the full test suite and type-check**

Run: `npx vitest run`
Expected: All tests pass except the pre-existing unrelated `BlogPage.test.tsx`/`PrescriptionSlip.test.tsx` failures (see prior session notes — not part of this task).

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/superadmin/SAModeration.tsx src/components/superadmin/SAModeration.test.tsx
git commit -m "feat: group superadmin moderation blogs and reviews by doctor"
```

---
