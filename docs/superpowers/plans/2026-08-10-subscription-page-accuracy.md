# Subscription Page Accuracy + Upgrade Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Subscription page's inaccurate plan cards and dead-feeling "Upgrade Plan" button with cards that reflect real enforcement, and a real (if manually-fulfilled) upgrade-request flow shared across the app.

**Architecture:** A new `src/lib/planFeatures.ts` module centralizes tier labels/prices/features and all plan-state derivation logic (single source of truth, no drift). A new `RequestUpgradeDialog` component replaces `ContactSupportDialog` on the Settings page and replaces `LockedFeatureCard`'s settings-navigation with a direct request flow, both writing to `support_tickets` with a new structured `metadata` column that `SATickets.tsx` renders for superadmins.

**Tech Stack:** React + TypeScript, Supabase (Postgres + supabase-js), Vitest + Testing Library, shadcn/ui (Dialog, Badge).

## Global Constraints

- Ticket `priority` is always `"normal"` — never user-editable in `RequestUpgradeDialog`.
- `support_tickets.metadata` is a nullable JSONB column — existing rows have `null`, never assume it's present.
- Tier display labels: `free` → "Basic", `pro` → "Basic", `premium` → "Premium" (free/pro have identical real feature access per the plan-gating spec — this is a billing-only distinction).
- Prices come from `DEFAULT_PLAN_PRICES` in `src/components/superadmin/SASubscriptions.tsx` (`free: 0, pro: 999, premium: 2499`) — never hardcode a price elsewhere.
- The Basic appointment cap number shown anywhere must come from `usePlanAccess().appointmentsCap` at render time — never hardcode `500`.
- `RequestUpgradeDialog`'s trigger button must keep the accessible name "Request Upgrade" at the `LockedFeatureCard` call site — `BillingPage.test.tsx`, `BlogPage.test.tsx`, `MyWebsite.test.tsx` assert this button's presence/absence by that name and must keep passing unchanged.
- `PricingSection.tsx` is explicitly out of scope — do not touch it in this plan.
- No real payment integration — Razorpay isn't connected; all copy must say a team member follows up, never imply automated billing.

---

### Task 1: `support_tickets.metadata` migration

**Files:**
- Create: `supabase/migrations/20260810000000_support_tickets_metadata.sql`
- Modify: `src/integrations/supabase/types.ts:734-780` (the `support_tickets` table block)

**Interfaces:**
- Produces: `support_tickets.metadata` column, nullable `jsonb`. TypeScript `Row`/`Insert`/`Update` types gain `metadata: Json | null` / `metadata?: Json | null` / `metadata?: Json | null`.

- [ ] **Step 1: Write the migration file**

```sql
ALTER TABLE public.support_tickets ADD COLUMN metadata jsonb;
```

- [ ] **Step 2: Apply the migration to the live DB**

Use the `mcp__supabase__apply_migration` tool with `project_id: "atmelijhxsjzjixhdfcu"`, `name: "support_tickets_metadata"`, and the SQL from Step 1. (This project applies migrations directly via the Supabase MCP tools, then commits the same SQL as a tracked file — confirmed as the established pattern from every prior migration in this codebase's history.)

- [ ] **Step 3: Verify the column exists and is nullable**

Run via `mcp__supabase__execute_sql`:
```sql
SELECT column_name, is_nullable, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name='support_tickets' AND column_name='metadata';
```
Expected: one row, `is_nullable = 'YES'`, `data_type = 'jsonb'`.

- [ ] **Step 4: Update `types.ts` by hand**

In `src/integrations/supabase/types.ts`, inside the `support_tickets` table block (around line 734), add `metadata: Json | null` to `Row`, and `metadata?: Json | null` to both `Insert` and `Update`:

```typescript
      support_tickets: {
        Row: {
          assigned_to: string | null
          created_at: string
          description: string | null
          doctor_id: string
          id: string
          metadata: Json | null
          notes: string | null
          priority: string
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          doctor_id: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          priority?: string
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          doctor_id?: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          priority?: string
          status?: string
          subject?: string
          updated_at?: string
        }
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260810000000_support_tickets_metadata.sql src/integrations/supabase/types.ts
git commit -m "feat: add metadata column to support_tickets for structured upgrade-request data"
```

---

### Task 2: `src/lib/planFeatures.ts` — shared tier data and plan-state logic

**Files:**
- Create: `src/lib/planFeatures.ts`
- Test: `src/lib/planFeatures.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_PLAN_PRICES` from `src/components/superadmin/SASubscriptions.tsx` (`export const DEFAULT_PLAN_PRICES: Record<string, number>`).
- Produces:
  - `TIER_LABELS: Record<string, string>` — `{ free: "Basic", pro: "Basic", premium: "Premium" }`
  - `TIER_PRICES: Record<string, number>` — re-export of `DEFAULT_PLAN_PRICES`
  - `hasNoActivePlan(planStatus: string): boolean`
  - `getTierFeatures(tier: "pro" | "premium", cap: number): string[]`
  - `type CardState = { badge: string; isCurrent: boolean; showCta: boolean }`
  - `getSubscriptionCardStates(planStatus: string, planTier: string, isPremium: boolean): { basic: CardState; premium: CardState }`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/planFeatures.test.ts
import { describe, it, expect } from "vitest";
import { TIER_LABELS, TIER_PRICES, hasNoActivePlan, getTierFeatures, getSubscriptionCardStates } from "./planFeatures";

describe("planFeatures", () => {
  it("labels free and pro identically as Basic, premium as Premium", () => {
    expect(TIER_LABELS.free).toBe("Basic");
    expect(TIER_LABELS.pro).toBe("Basic");
    expect(TIER_LABELS.premium).toBe("Premium");
  });

  it("exposes real prices", () => {
    expect(TIER_PRICES.pro).toBe(999);
    expect(TIER_PRICES.premium).toBe(2499);
  });

  it("hasNoActivePlan is true only for expired and cancelled", () => {
    expect(hasNoActivePlan("expired")).toBe(true);
    expect(hasNoActivePlan("cancelled")).toBe(true);
    expect(hasNoActivePlan("trial")).toBe(false);
    expect(hasNoActivePlan("active")).toBe(false);
  });

  it("getTierFeatures includes the live cap for pro, omits it for premium", () => {
    const basic = getTierFeatures("pro", 500);
    expect(basic.some((f) => f.includes("500"))).toBe(true);
    expect(basic).not.toContain("Online Consultation (Zoom)");

    const premium = getTierFeatures("premium", 500);
    expect(premium).toContain("Online Consultation (Zoom)");
    expect(premium).toContain("Billing & Invoices");
    expect(premium).toContain("AI Blog Writer");
  });

  it("trial: premium is current via trial, basic has no CTA", () => {
    const { basic, premium } = getSubscriptionCardStates("trial", "free", true);
    expect(premium.isCurrent).toBe(true);
    expect(premium.showCta).toBe(false);
    expect(basic.showCta).toBe(false);
  });

  it("active premium tier: premium current, basic informational only", () => {
    const { basic, premium } = getSubscriptionCardStates("active", "premium", true);
    expect(premium.isCurrent).toBe(true);
    expect(premium.showCta).toBe(false);
    expect(basic.isCurrent).toBe(false);
    expect(basic.showCta).toBe(false);
  });

  it("active basic tier: basic current with no CTA, premium shows CTA", () => {
    const { basic, premium } = getSubscriptionCardStates("active", "pro", false);
    expect(basic.isCurrent).toBe(true);
    expect(basic.showCta).toBe(false);
    expect(premium.showCta).toBe(true);
  });

  it("expired: neither card is current, both show a CTA", () => {
    const { basic, premium } = getSubscriptionCardStates("expired", "free", false);
    expect(basic.isCurrent).toBe(false);
    expect(basic.showCta).toBe(true);
    expect(premium.isCurrent).toBe(false);
    expect(premium.showCta).toBe(true);
  });

  it("cancelled: same treatment as expired", () => {
    const { basic, premium } = getSubscriptionCardStates("cancelled", "free", false);
    expect(basic.showCta).toBe(true);
    expect(premium.showCta).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/planFeatures.test.ts`
Expected: FAIL — `./planFeatures` module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/planFeatures.ts
import { DEFAULT_PLAN_PRICES } from "@/components/superadmin/SASubscriptions";

export const TIER_LABELS: Record<string, string> = {
  free: "Basic",
  pro: "Basic",
  premium: "Premium",
};

export const TIER_PRICES: Record<string, number> = DEFAULT_PLAN_PRICES;

export function hasNoActivePlan(planStatus: string): boolean {
  return planStatus === "expired" || planStatus === "cancelled";
}

export function getTierFeatures(tier: "pro" | "premium", cap: number): string[] {
  if (tier === "premium") {
    return [
      "Website Builder",
      "Unlimited Appointment Booking",
      "Patient Records",
      "Manual Blog Posts",
      "Basic Analytics",
      "Online Consultation (Zoom)",
      "Billing & Invoices",
      "AI Blog Writer",
    ];
  }
  return [
    "Website Builder",
    `Appointment Booking (up to ${cap}/month)`,
    "Patient Records",
    "Manual Blog Posts",
    "Basic Analytics",
  ];
}

export type CardState = { badge: string; isCurrent: boolean; showCta: boolean };

export function getSubscriptionCardStates(
  planStatus: string,
  planTier: string,
  isPremium: boolean
): { basic: CardState; premium: CardState } {
  if (planStatus === "trial") {
    return {
      premium: { badge: "Included via your trial", isCurrent: true, showCta: false },
      basic: { badge: "What you'll have after your trial ends", isCurrent: false, showCta: false },
    };
  }
  if (isPremium) {
    return {
      premium: { badge: "Current Plan", isCurrent: true, showCta: false },
      basic: { badge: "Included in your plan", isCurrent: false, showCta: false },
    };
  }
  if (planStatus === "active") {
    return {
      basic: { badge: "Current Plan", isCurrent: true, showCta: false },
      premium: { badge: "", isCurrent: false, showCta: true },
    };
  }
  // hasNoActivePlan(planStatus): expired or cancelled
  return {
    basic: { badge: "Your access level", isCurrent: false, showCta: true },
    premium: { badge: "", isCurrent: false, showCta: true },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/planFeatures.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/planFeatures.ts src/lib/planFeatures.test.ts
git commit -m "feat: add planFeatures module as single source of truth for tier labels/prices/features"
```

---

### Task 3: `RequestUpgradeDialog` component

**Files:**
- Create: `src/components/admin/RequestUpgradeDialog.tsx`
- Test: `src/components/admin/RequestUpgradeDialog.test.tsx`

**Interfaces:**
- Consumes: `useProfile()` from `src/hooks/useProfile.ts` (`{ profile: Tables<"profiles"> | null }`), `usePlanAccess()` from `src/hooks/usePlanAccess.ts` (`{ appointmentsCap: number }`), `TIER_LABELS`, `TIER_PRICES`, `hasNoActivePlan`, `getTierFeatures` from `src/lib/planFeatures.ts`, `supabase` from `src/integrations/supabase/client.ts`.
- Produces: `export default function RequestUpgradeDialog({ targetTier, trigger }: { targetTier: "pro" | "premium"; trigger: React.ReactNode })`. Renders a `Dialog` (shadcn) whose trigger is the passed `trigger` node — the trigger's accessible name/content is caller-controlled and unmodified.

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/admin/RequestUpgradeDialog.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import RequestUpgradeDialog from "./RequestUpgradeDialog";

const insertMock = vi.fn().mockResolvedValue({ error: null });

vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({ profile: { plan_tier: "pro", plan_status: "active" }, loading: false }),
}));
vi.mock("@/hooks/usePlanAccess", () => ({
  usePlanAccess: () => ({ isPremium: false, appointmentsCap: 500, appointmentsUsed: 0, nearCap: false, loading: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "doctor-1" } } }) },
    from: vi.fn(() => ({ insert: insertMock })),
  },
}));

describe("RequestUpgradeDialog", () => {
  beforeEach(() => insertMock.mockClear());

  it("opens on trigger click and shows the target tier's features", () => {
    render(<RequestUpgradeDialog targetTier="premium" trigger={<button>Request Upgrade</button>} />);
    fireEvent.click(screen.getByRole("button", { name: "Request Upgrade" }));
    expect(screen.getByText(/online consultation/i)).toBeInTheDocument();
    expect(screen.getByText(/billing & invoices/i)).toBeInTheDocument();
  });

  it("submits an upgrade-request ticket with structured metadata for an active Basic doctor", async () => {
    render(<RequestUpgradeDialog targetTier="premium" trigger={<button>Request Upgrade</button>} />);
    fireEvent.click(screen.getByRole("button", { name: "Request Upgrade" }));
    fireEvent.click(screen.getByRole("button", { name: /send request/i }));

    await waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));
    const payload = insertMock.mock.calls[0][0];
    expect(payload.subject).toBe("Upgrade request: Basic → Premium");
    expect(payload.priority).toBe("normal");
    expect(payload.metadata).toEqual({
      upgrade_request: { from_tier: "pro", from_status: "active", to_tier: "premium" },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/admin/RequestUpgradeDialog.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/admin/RequestUpgradeDialog.tsx
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { usePlanAccess } from "@/hooks/usePlanAccess";
import { toast } from "@/hooks/use-toast";
import { TIER_LABELS, hasNoActivePlan, getTierFeatures } from "@/lib/planFeatures";

const RequestUpgradeDialog = ({
  targetTier,
  trigger,
}: {
  targetTier: "pro" | "premium";
  trigger: React.ReactNode;
}) => {
  const { profile } = useProfile();
  const { appointmentsCap } = usePlanAccess();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const fromTier = profile?.plan_tier || "free";
  const fromStatus = profile?.plan_status || "trial";
  const noActivePlan = hasNoActivePlan(fromStatus);
  const toLabel = TIER_LABELS[targetTier];
  const subject = noActivePlan
    ? `Reactivation request: ${fromStatus} → ${toLabel}`
    : `Upgrade request: ${TIER_LABELS[fromTier]} → ${toLabel}`;
  const features = getTierFeatures(targetTier, appointmentsCap || 500);

  const submit = async () => {
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); return; }
    const { error } = await supabase.from("support_tickets").insert({
      doctor_id: user.id,
      subject,
      description: message,
      priority: "normal",
      metadata: { upgrade_request: { from_tier: fromTier, from_status: fromStatus, to_tier: targetTier } },
    } as any);
    setBusy(false);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "Request sent", description: "Our team will reach out to arrange payment." });
    setMessage("");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{noActivePlan ? `Reactivate on ${toLabel}` : `Request Upgrade to ${toLabel}`}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Nothing is billed automatically — a team member will reach out to arrange payment and
            switch your plan.
          </p>
          <div>
            <p className="text-xs font-medium mb-1.5">{toLabel} includes:</p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {features.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-royal" />{f}
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-1.5">
            <Label>Anything else we should know? (optional)</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} />
          </div>
          <Button onClick={submit} disabled={busy} className="w-full">
            {busy ? "Sending…" : "Send Request"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RequestUpgradeDialog;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/admin/RequestUpgradeDialog.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/RequestUpgradeDialog.tsx src/components/admin/RequestUpgradeDialog.test.tsx
git commit -m "feat: add RequestUpgradeDialog with structured support_tickets metadata"
```

---

### Task 4: Wire `RequestUpgradeDialog` into `LockedFeatureCard`

**Files:**
- Modify: `src/components/admin/LockedFeatureCard.tsx` (full file, 31 lines)
- Modify: `src/components/admin/LockedFeatureCard.test.tsx` (full file, 36 lines)

**Interfaces:**
- Consumes: `RequestUpgradeDialog` from Task 3 (`targetTier="premium"`, `trigger: React.ReactNode`).
- Produces: same public props as before — `{ featureName: string; description: string }` — unchanged, so `BillingPage.tsx`/`BlogPage.tsx`/`MyWebsite.tsx` call sites need no changes.

- [ ] **Step 1: Update the failing test first**

Replace `src/components/admin/LockedFeatureCard.test.tsx` in full:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import LockedFeatureCard from "./LockedFeatureCard";

vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({ profile: { plan_tier: "pro", plan_status: "active" }, loading: false }),
}));
vi.mock("@/hooks/usePlanAccess", () => ({
  usePlanAccess: () => ({ isPremium: false, appointmentsCap: 500, appointmentsUsed: 0, nearCap: false, loading: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "doctor-1" } } }) },
    from: vi.fn().mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: null }) }),
  },
}));

describe("LockedFeatureCard", () => {
  it("renders the feature name and description, and opens the upgrade-request dialog on click", () => {
    render(<LockedFeatureCard featureName="Billing & Invoices" description="Track revenue and generate GST invoices." />);

    expect(screen.getByText("Billing & Invoices")).toBeInTheDocument();
    expect(screen.getByText(/track revenue and generate gst invoices/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /request upgrade/i }));
    expect(screen.getByText(/request upgrade to premium/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/admin/LockedFeatureCard.test.tsx`
Expected: FAIL — dialog content not found (button still navigates instead of opening a dialog).

- [ ] **Step 3: Rewrite the implementation**

Replace `src/components/admin/LockedFeatureCard.tsx` in full:

```tsx
import { Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import RequestUpgradeDialog from "./RequestUpgradeDialog";

interface Props {
  featureName: string;
  description: string;
}

export default function LockedFeatureCard({ featureName, description }: Props) {
  return (
    <Card className="border-dashed border-2 border-border">
      <CardContent className="py-16 flex flex-col items-center text-center gap-3 max-w-md mx-auto">
        <div className="h-14 w-14 rounded-full bg-royal/10 flex items-center justify-center text-royal">
          <Lock className="h-6 w-6" />
        </div>
        <h2 className="font-heading font-bold text-xl text-primary">{featureName}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
        <RequestUpgradeDialog
          targetTier="premium"
          trigger={<Button className="bg-royal hover:bg-royal/90 mt-2">Request Upgrade</Button>}
        />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/admin/LockedFeatureCard.test.tsx`
Expected: PASS.

Then run the three call-site tests to confirm they're unaffected (they only assert the button's presence by accessible name, never click it):

Run: `npx vitest run src/components/admin/BillingPage.test.tsx src/components/admin/BlogPage.test.tsx src/components/admin/MyWebsite.test.tsx`
Expected: PASS, unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/LockedFeatureCard.tsx src/components/admin/LockedFeatureCard.test.tsx
git commit -m "feat: LockedFeatureCard opens RequestUpgradeDialog directly instead of navigating to settings"
```

---

### Task 5: Rebuild `SettingsPage.tsx`'s Subscription cards

**Files:**
- Modify: `src/components/admin/SettingsPage.tsx` (imports at top, and the two-card block currently at lines 99-123, plus removing the top "Upgrade Plan" button at lines 83-86 — see Step 3 for the exact reasoning)
- Test: `src/components/admin/SettingsPage.test.tsx` (new — no test file exists for this component today)

**Interfaces:**
- Consumes: `usePlanAccess()` (`{ isPremium: boolean; appointmentsCap: number }`), `getSubscriptionCardStates`, `getTierFeatures`, `TIER_LABELS`, `TIER_PRICES` from `src/lib/planFeatures.ts` (Task 2), `RequestUpgradeDialog` (Task 3).
- Produces: no exported interface change — `SettingsPage` remains the default export used by the router.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/admin/SettingsPage.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SettingsPage from "./SettingsPage";
import { usePlanAccess } from "@/hooks/usePlanAccess";
import { useProfile } from "@/hooks/useProfile";

vi.mock("@/hooks/usePlanAccess", () => ({ usePlanAccess: vi.fn() }));
vi.mock("@/hooks/useProfile", () => ({ useProfile: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "doctor-1" } } }) },
    from: vi.fn().mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: null }) }),
  },
}));

const baseProfile = { id: "doctor-1", full_name: "Dr. Test" };

describe("SettingsPage subscription cards", () => {
  it("trial doctor: Premium marked current via trial, Basic has no CTA", () => {
    vi.mocked(useProfile).mockReturnValue({ profile: { ...baseProfile, plan_status: "trial", plan_tier: "free" }, loading: false, setProfile: vi.fn(), refetch: vi.fn() } as any);
    vi.mocked(usePlanAccess).mockReturnValue({ isPremium: true, appointmentsCap: 0, appointmentsUsed: 0, nearCap: false, loading: false });
    render(<SettingsPage />);
    expect(screen.getByText(/included via your trial/i)).toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: /request upgrade/i })).toHaveLength(0);
  });

  it("active Basic doctor: Basic marked current, Premium shows a CTA", () => {
    vi.mocked(useProfile).mockReturnValue({ profile: { ...baseProfile, plan_status: "active", plan_tier: "pro" }, loading: false, setProfile: vi.fn(), refetch: vi.fn() } as any);
    vi.mocked(usePlanAccess).mockReturnValue({ isPremium: false, appointmentsCap: 500, appointmentsUsed: 0, nearCap: false, loading: false });
    render(<SettingsPage />);
    expect(screen.getAllByText(/current plan/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /request upgrade/i })).toHaveLength(1);
  });

  it("expired doctor: neither card says Current Plan, both show a CTA", () => {
    vi.mocked(useProfile).mockReturnValue({ profile: { ...baseProfile, plan_status: "expired", plan_tier: "free" }, loading: false, setProfile: vi.fn(), refetch: vi.fn() } as any);
    vi.mocked(usePlanAccess).mockReturnValue({ isPremium: false, appointmentsCap: 500, appointmentsUsed: 0, nearCap: false, loading: false });
    render(<SettingsPage />);
    expect(screen.queryByText(/^current plan$/i)).not.toBeInTheDocument();
    expect(screen.getByText(/your access level/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /request upgrade/i })).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/admin/SettingsPage.test.tsx`
Expected: FAIL — current implementation always renders static "Free Trial"/"Pro Plan" text, no "Current Plan"/"Your access level" text exists yet.

- [ ] **Step 3: Update imports and remove the old top-level Upgrade Plan button**

In `src/components/admin/SettingsPage.tsx`, replace the import block:

```tsx
import { Settings, Crown, Shield, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { differenceInDays } from "date-fns";
import ContactSupportDialog from "./ContactSupportDialog";
```

with:

```tsx
import { Settings, Crown, Shield, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { differenceInDays } from "date-fns";
import { usePlanAccess } from "@/hooks/usePlanAccess";
import RequestUpgradeDialog from "./RequestUpgradeDialog";
import { getSubscriptionCardStates, getTierFeatures, TIER_LABELS, TIER_PRICES } from "@/lib/planFeatures";
```

Then, inside the `SettingsPage` component body, right after the existing `const daysLeft = ...` / `const trialProgress = ...` lines, add:

```tsx
  const { isPremium, appointmentsCap } = usePlanAccess();
  const planTier = profile?.plan_tier || "free";
  const planStatus = profile?.plan_status || "trial";
  const { basic, premium } = getSubscriptionCardStates(planStatus, planTier, isPremium);
  const basicFeatures = getTierFeatures("pro", appointmentsCap || 500);
  const premiumFeatures = getTierFeatures("premium", appointmentsCap || 500);
```

The old top-level "Upgrade Plan" button (next to the status badge) is removed — not just its dialog swapped — because each card now carries its own tier-specific CTA, and keeping a third, generic "Upgrade Plan" button alongside two explicit per-card buttons would recreate the exact ambiguity problem 1 was about fixing. Replace:

```tsx
                  <ContactSupportDialog
                    defaultSubject="Upgrade to Premium"
                    trigger={<Button className="bg-royal hover:bg-royal/90">Upgrade Plan</Button>}
                  />
```

with nothing (delete those 3 lines, leaving the `<div>` containing the status badge as the sole child of its flex container).

- [ ] **Step 4: Replace the two static cards**

Replace the existing card block:

```tsx
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-border p-5">
                  <h3 className="font-heading font-bold text-foreground mb-1">Free Trial</h3>
                  <p className="text-sm text-muted-foreground mb-3">7 days, all features</p>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    {["Website Builder", "Appointment Booking", "Patient Records", "Blog (1 post)", "Basic Analytics"].map(f => (
                      <li key={f} className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-success" />{f}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border-2 border-royal p-5 relative">
                  <Badge className="absolute -top-2.5 right-4 bg-royal text-white text-[10px]">RECOMMENDED</Badge>
                  <h3 className="font-heading font-bold text-foreground mb-1">Pro Plan</h3>
                  <p className="text-sm text-muted-foreground mb-3">₹999/month</p>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    {["Everything in Free", "Unlimited Blogs", "AI Blog Writer", "WhatsApp Integration", "Priority Support", "Custom Domain"].map(f => (
                      <li key={f} className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-royal" />{f}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
```

with:

```tsx
              <div className="grid sm:grid-cols-2 gap-4">
                <div className={`rounded-xl p-5 relative ${basic.isCurrent ? "border-2 border-royal" : "border border-border"}`}>
                  {basic.badge && (
                    <Badge className={`absolute -top-2.5 right-4 text-[10px] ${basic.isCurrent ? "bg-royal text-white" : "bg-secondary text-muted-foreground"}`}>
                      {basic.badge}
                    </Badge>
                  )}
                  <h3 className="font-heading font-bold text-foreground mb-1">{TIER_LABELS.pro}</h3>
                  <p className="text-sm text-muted-foreground mb-3">₹{TIER_PRICES.pro}/month</p>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    {basicFeatures.map(f => (
                      <li key={f} className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-royal" />{f}
                      </li>
                    ))}
                  </ul>
                  {basic.showCta && (
                    <RequestUpgradeDialog
                      targetTier="pro"
                      trigger={<Button size="sm" className="w-full mt-4 bg-royal hover:bg-royal/90">Request Upgrade</Button>}
                    />
                  )}
                </div>
                <div className={`rounded-xl p-5 relative ${premium.isCurrent ? "border-2 border-royal" : "border border-border"}`}>
                  {premium.badge && (
                    <Badge className={`absolute -top-2.5 right-4 text-[10px] ${premium.isCurrent ? "bg-royal text-white" : "bg-secondary text-muted-foreground"}`}>
                      {premium.badge}
                    </Badge>
                  )}
                  <h3 className="font-heading font-bold text-foreground mb-1">{TIER_LABELS.premium}</h3>
                  <p className="text-sm text-muted-foreground mb-3">₹{TIER_PRICES.premium}/month</p>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    {premiumFeatures.map(f => (
                      <li key={f} className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-royal" />{f}
                      </li>
                    ))}
                  </ul>
                  {premium.showCta && (
                    <RequestUpgradeDialog
                      targetTier="premium"
                      trigger={<Button size="sm" className="w-full mt-4 bg-royal hover:bg-royal/90">Request Upgrade</Button>}
                    />
                  )}
                </div>
              </div>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/components/admin/SettingsPage.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck the whole project**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/SettingsPage.tsx src/components/admin/SettingsPage.test.tsx
git commit -m "feat: rebuild Subscription page cards to reflect real plan-gating enforcement"
```

---

### Task 6: Render upgrade-request metadata in `SATickets.tsx`

**Files:**
- Modify: `src/components/superadmin/SATickets.tsx` (add one import, one JSX block in the ticket-detail dialog)

**Interfaces:**
- Consumes: `TIER_LABELS` from `src/lib/planFeatures.ts` (Task 2), `open.metadata` (the selected ticket row, already in local state as `open`).

No new test file — no test file exists for any superadmin component in this codebase today (confirmed: `src/components/superadmin/*.test.tsx` has zero matches), so this task is verified manually per the existing convention for untested superadmin surfaces, consistent with how edge-function/DB-trigger work in this codebase's history was verified.

- [ ] **Step 1: Add the import**

In `src/components/superadmin/SATickets.tsx`, add to the top import block:

```tsx
import { TIER_LABELS } from "@/lib/planFeatures";
```

- [ ] **Step 2: Render the metadata summary**

Replace:

```tsx
              <DialogHeader><DialogTitle>{open.subject}</DialogTitle></DialogHeader>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{open.description || "No description."}</p>
```

with:

```tsx
              <DialogHeader><DialogTitle>{open.subject}</DialogTitle></DialogHeader>
              {open.metadata?.upgrade_request && (
                <div className="text-sm bg-secondary rounded-lg p-3">
                  {TIER_LABELS[open.metadata.upgrade_request.from_tier] || open.metadata.upgrade_request.from_tier}
                  {" "}({open.metadata.upgrade_request.from_status}) →{" "}
                  {TIER_LABELS[open.metadata.upgrade_request.to_tier] || open.metadata.upgrade_request.to_tier}
                </div>
              )}
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{open.description || "No description."}</p>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors. (`open` is typed `any` in this file already, so `open.metadata?.upgrade_request` needs no additional typing work.)

- [ ] **Step 4: Manual verification**

Using the `mcp__supabase__execute_sql` tool against project `atmelijhxsjzjixhdfcu`, insert a test ticket with metadata:
```sql
INSERT INTO support_tickets (doctor_id, subject, priority, metadata)
SELECT id, 'Upgrade request: Basic → Premium', 'normal',
  '{"upgrade_request": {"from_tier": "pro", "from_status": "active", "to_tier": "premium"}}'::jsonb
FROM profiles LIMIT 1
RETURNING id;
```
Start the dev server, log in as a superadmin, open Support Tickets, click the inserted ticket, and confirm the summary line "Basic (active) → Premium" renders above the description. Then delete the test row:
```sql
DELETE FROM support_tickets WHERE subject = 'Upgrade request: Basic → Premium';
```

- [ ] **Step 5: Commit**

```bash
git add src/components/superadmin/SATickets.tsx
git commit -m "feat: render upgrade-request metadata summary in SATickets detail view"
```

---

### Task 7: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass, including the previously-existing `BillingPage.test.tsx`, `BlogPage.test.tsx`, `MyWebsite.test.tsx`, `usePlanAccess.test.ts`.

- [ ] **Step 2: Full project typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 3: Manual QA — walk a real test doctor through all four branches**

Using `SADoctorDetail.tsx` (superadmin) on a test doctor and the doctor's own Settings page in a second browser session, verify for each `plan_status`/`plan_tier` combination:
- `trial` / any tier → Premium card badge "Included via your trial", no CTA on either card.
- `active` / `pro` → Basic card badge "Current Plan", no CTA on Basic; Premium card shows "Request Upgrade" CTA that opens `RequestUpgradeDialog` with subject "Upgrade request: Basic → Premium".
- `active` / `premium` → Premium card badge "Current Plan", no CTA on either card.
- `expired` / `free` → neither card says "Current Plan"; Basic card badge "Your access level" with a CTA; Premium card CTA. Both open `RequestUpgradeDialog` with subject "Reactivation request: expired → Basic" / "Reactivation request: expired → Premium" respectively.

For each CTA click, submit the dialog and confirm the resulting ticket appears correctly in `SATickets.tsx` with the rendered metadata summary from Task 6.

- [ ] **Step 4: Confirm no regressions in LockedFeatureCard call sites**

Visit `BillingPage`, `BlogPage`, and `MyWebsite`'s Online Consultation section as a Basic-tier test doctor; confirm each "Request Upgrade" button opens `RequestUpgradeDialog` (targetTier="premium") directly, with no intermediate navigation to Settings.
