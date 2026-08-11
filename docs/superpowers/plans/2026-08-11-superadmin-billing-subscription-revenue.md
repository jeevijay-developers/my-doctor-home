# Superadmin Billing — Subscription Revenue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/superadmin/billing`'s patient-invoice bar chart with real doctor→Doctylia subscription revenue (from `plan_upgrade_payments`), laid out like `/admin/billing`, and de-duplicate the stat-card / donut-chart markup both pages need.

**Architecture:** Extract two presentational components (`StatCard`, `PaymentStatusDonut`) and one pure data-helper module (`subscriptionRevenue.ts`) that the rewritten `SABilling.tsx` and the refactored `admin/BillingPage.tsx` both consume. `SABilling.tsx` queries `plan_upgrade_payments` (joined to `profiles`) platform-wide instead of `invoices`, buckets the 5-value `payment_txn_status` enum into 4 UI statuses, and derives an "Estimated MRR" figure from `profiles`.

**Tech Stack:** React + TypeScript, Supabase JS client, shadcn/ui primitives (`Card`, `Tabs`, `Select`, `Badge`, `Button`), `recharts` (already a dependency), `date-fns` (already a dependency), Vitest + Testing Library.

## Global Constraints

- No new npm dependencies — `recharts` and `date-fns` are already used elsewhere in the app.
- No new database tables/migrations. Data source is the existing `plan_upgrade_payments` table and `profiles` columns (`plan_status`, `plan_tier`, `custom_plan_price`).
- Reuse `DEFAULT_PLAN_PRICES` exported from `src/components/superadmin/SASubscriptions.tsx` — do not redefine tier prices elsewhere.
- Reuse `TestModeBadge` (`src/components/shared/TestModeBadge.tsx`) for `is_mock` rows instead of inventing a new mock indicator.
- New/co-located test files use Vitest + `@testing-library/react`, matching the existing convention (see `src/components/admin/BillingPage.test.tsx`).
- Preserve the existing dark superadmin theme — all styling goes through existing Tailwind color tokens (`royal`, `teal`, `spark`, `success`, `warning`, `destructive`) and shared `@/components/ui/*` primitives, no new colors.
- `admin/BillingPage.tsx`'s own data source, doctor-scoping, and invoice-generation logic are untouched — only its stat cards and donut chart are swapped for the new shared components.

---

### Task 1: `StatCard` shared component

**Files:**
- Create: `src/components/shared/StatCard.tsx`
- Test: `src/components/shared/StatCard.test.tsx`

**Interfaces:**
- Produces: `StatCard` (default export), props `{ label: string; value: string; icon: LucideIcon; gradient: string }`. `value` is a pre-formatted display string (caller formats currency/number), not a raw number.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/shared/StatCard.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { IndianRupee } from "lucide-react";
import StatCard from "./StatCard";

describe("StatCard", () => {
  it("renders the label and pre-formatted value", () => {
    render(<StatCard label="This Month" value="₹12,000" icon={IndianRupee} gradient="from-royal to-teal" />);
    expect(screen.getByText("This Month")).toBeInTheDocument();
    expect(screen.getByText("₹12,000")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/shared/StatCard.test.tsx`
Expected: FAIL — cannot find module `./StatCard`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/shared/StatCard.tsx
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  gradient: string;
}

const StatCard = ({ label, value, icon: Icon, gradient }: StatCardProps) => (
  <Card className="border-0 shadow-none overflow-hidden">
    <CardContent className={`p-5 bg-gradient-to-br ${gradient} text-white relative`}>
      <div className="absolute top-3 right-3 opacity-20">
        <Icon className="h-12 w-12" />
      </div>
      <div className="relative z-10">
        <div className="text-sm font-medium text-white/80">{label}</div>
        <div className="font-heading font-extrabold text-2xl mt-1">{value}</div>
      </div>
    </CardContent>
  </Card>
);

export default StatCard;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/shared/StatCard.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/StatCard.tsx src/components/shared/StatCard.test.tsx
git commit -m "feat: add shared StatCard component"
```

---

### Task 2: `PaymentStatusDonut` shared component

**Files:**
- Create: `src/components/shared/PaymentStatusDonut.tsx`
- Test: `src/components/shared/PaymentStatusDonut.test.tsx`

**Interfaces:**
- Produces: `PaymentStatusDonut` (default export), props `{ buckets: DonutSegment[]; total: number }`. Also exports `interface DonutSegment { label: string; count: number; color: string }` (generic chart-data shape — not coupled to payment-status domain types).
- Consumes: `recharts` (`PieChart`, `Pie`, `Cell`, `ResponsiveContainer`) — already a project dependency.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/shared/PaymentStatusDonut.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PaymentStatusDonut from "./PaymentStatusDonut";

describe("PaymentStatusDonut", () => {
  it("renders the total and a legend row per bucket", () => {
    render(
      <PaymentStatusDonut
        total={7}
        buckets={[
          { label: "Paid", count: 4, color: "hsl(var(--success))" },
          { label: "Pending", count: 2, color: "hsl(var(--warning))" },
          { label: "Failed", count: 1, color: "hsl(var(--destructive))" },
        ]}
      />
    );
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("Paid")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("renders a zero total with no buckets without crashing", () => {
    render(<PaymentStatusDonut total={0} buckets={[]} />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/shared/PaymentStatusDonut.test.tsx`
Expected: FAIL — cannot find module `./PaymentStatusDonut`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/shared/PaymentStatusDonut.tsx
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

export interface DonutSegment {
  label: string;
  count: number;
  color: string;
}

interface PaymentStatusDonutProps {
  buckets: DonutSegment[];
  total: number;
}

const PaymentStatusDonut = ({ buckets, total }: PaymentStatusDonutProps) => {
  const chartData = buckets.filter((b) => b.count > 0);

  return (
    <div>
      <div className="relative w-40 h-40 mx-auto mb-4">
        {chartData.length > 0 ? (
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={chartData}
                dataKey="count"
                nameKey="label"
                innerRadius="65%"
                outerRadius="90%"
                startAngle={90}
                endAngle={-270}
                stroke="none"
              >
                {chartData.map((b) => (
                  <Cell key={b.label} fill={b.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="w-full h-full rounded-full border-[6px] border-secondary" />
        )}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="font-heading font-bold text-xl text-foreground">{total}</div>
            <div className="text-[10px] text-muted-foreground">Total</div>
          </div>
        </div>
      </div>
      <div className="space-y-2">
        {buckets.map((b) => (
          <div key={b.label} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: b.color }} />
              <span className="text-muted-foreground text-xs">{b.label}</span>
            </div>
            <span className="font-medium text-foreground text-xs">{b.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PaymentStatusDonut;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/shared/PaymentStatusDonut.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/PaymentStatusDonut.tsx src/components/shared/PaymentStatusDonut.test.tsx
git commit -m "feat: add shared PaymentStatusDonut component"
```

---

### Task 3: `subscriptionRevenue.ts` data helpers

**Files:**
- Create: `src/lib/subscriptionRevenue.ts`
- Test: `src/lib/subscriptionRevenue.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_PLAN_PRICES` from `@/components/superadmin/SASubscriptions` (existing export: `Record<string, number>`, `{ free: 0, pro: 1499, premium: 3999 }`).
- Produces:
  - `type PaymentTxnStatus = "created" | "authorized" | "captured" | "failed" | "refunded"`
  - `type PaymentStatusBucket = "Paid" | "Pending" | "Failed" | "Refunded"`
  - `bucketPaymentStatus(status: PaymentTxnStatus): PaymentStatusBucket`
  - `interface UpgradePayment { amount: number; status: PaymentTxnStatus; created_at: string }`
  - `interface RevenueTotals { today: number; week: number; month: number }`
  - `computeRevenueTotals(payments: UpgradePayment[], now?: Date): RevenueTotals`
  - `interface SubscriberProfile { plan_status: string | null; plan_tier: string | null; custom_plan_price: number | null }`
  - `computeEstimatedMRR(profiles: SubscriberProfile[]): number`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/subscriptionRevenue.test.ts
import { describe, it, expect } from "vitest";
import { bucketPaymentStatus, computeRevenueTotals, computeEstimatedMRR } from "./subscriptionRevenue";

describe("bucketPaymentStatus", () => {
  it("maps each raw payment_txn_status value to its UI bucket", () => {
    expect(bucketPaymentStatus("captured")).toBe("Paid");
    expect(bucketPaymentStatus("created")).toBe("Pending");
    expect(bucketPaymentStatus("authorized")).toBe("Pending");
    expect(bucketPaymentStatus("failed")).toBe("Failed");
    expect(bucketPaymentStatus("refunded")).toBe("Refunded");
  });
});

describe("computeRevenueTotals", () => {
  // 2026-08-11 is a Tuesday; the week (Sun-start) runs 2026-08-09..2026-08-15.
  const now = new Date("2026-08-11T12:00:00.000Z");

  it("sums only captured payments within each window", () => {
    const payments = [
      { amount: 100, status: "captured" as const, created_at: "2026-08-11T09:00:00.000Z" }, // today
      { amount: 200, status: "captured" as const, created_at: "2026-08-09T09:00:00.000Z" }, // this week, not today
      { amount: 300, status: "captured" as const, created_at: "2026-08-02T09:00:00.000Z" }, // this month, not this week
      { amount: 400, status: "failed" as const, created_at: "2026-08-11T09:00:00.000Z" }, // excluded: not captured
      { amount: 500, status: "captured" as const, created_at: "2026-07-01T09:00:00.000Z" }, // excluded: last month
    ];
    const totals = computeRevenueTotals(payments, now);
    expect(totals.today).toBe(100);
    expect(totals.week).toBe(300);
    expect(totals.month).toBe(600);
  });

  it("includes mock payments in the totals (mock payments are not excluded)", () => {
    const payments = [{ amount: 99, status: "captured" as const, created_at: "2026-08-11T09:00:00.000Z" }];
    expect(computeRevenueTotals(payments, now).today).toBe(99);
  });
});

describe("computeEstimatedMRR", () => {
  it("sums active pro/premium doctors using custom price or default tier price", () => {
    const profiles = [
      { plan_status: "active", plan_tier: "pro", custom_plan_price: null }, // default 1499
      { plan_status: "active", plan_tier: "premium", custom_plan_price: 2999 }, // custom override
      { plan_status: "trial", plan_tier: "premium", custom_plan_price: null }, // excluded: not active
      { plan_status: "active", plan_tier: "free", custom_plan_price: null }, // excluded: free tier
      { plan_status: "cancelled", plan_tier: "pro", custom_plan_price: null }, // excluded: cancelled
    ];
    expect(computeEstimatedMRR(profiles)).toBe(1499 + 2999);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/subscriptionRevenue.test.ts`
Expected: FAIL — cannot find module `./subscriptionRevenue`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/subscriptionRevenue.ts
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { DEFAULT_PLAN_PRICES } from "@/components/superadmin/SASubscriptions";

export type PaymentTxnStatus = "created" | "authorized" | "captured" | "failed" | "refunded";
export type PaymentStatusBucket = "Paid" | "Pending" | "Failed" | "Refunded";

export const bucketPaymentStatus = (status: PaymentTxnStatus): PaymentStatusBucket => {
  switch (status) {
    case "captured":
      return "Paid";
    case "created":
    case "authorized":
      return "Pending";
    case "failed":
      return "Failed";
    case "refunded":
      return "Refunded";
  }
};

export interface UpgradePayment {
  amount: number;
  status: PaymentTxnStatus;
  created_at: string;
}

export interface RevenueTotals {
  today: number;
  week: number;
  month: number;
}

export const computeRevenueTotals = (payments: UpgradePayment[], now: Date = new Date()): RevenueTotals => {
  const captured = payments.filter((p) => p.status === "captured");
  const sumInRange = (start: Date, end: Date) =>
    captured
      .filter((p) => {
        const d = new Date(p.created_at);
        return d >= start && d <= end;
      })
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  return {
    today: sumInRange(startOfDay(now), endOfDay(now)),
    week: sumInRange(startOfWeek(now), endOfWeek(now)),
    month: sumInRange(startOfMonth(now), endOfMonth(now)),
  };
};

export interface SubscriberProfile {
  plan_status: string | null;
  plan_tier: string | null;
  custom_plan_price: number | null;
}

export const computeEstimatedMRR = (profiles: SubscriberProfile[]): number =>
  profiles
    .filter((p) => p.plan_status === "active" && (p.plan_tier === "pro" || p.plan_tier === "premium"))
    .reduce((sum, p) => sum + (p.custom_plan_price ?? DEFAULT_PLAN_PRICES[p.plan_tier || "free"] ?? 0), 0);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/subscriptionRevenue.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/subscriptionRevenue.ts src/lib/subscriptionRevenue.test.ts
git commit -m "feat: add subscription revenue bucketing and MRR helpers"
```

---

### Task 4: Refactor `admin/BillingPage.tsx` to use `StatCard` and `PaymentStatusDonut`

**Files:**
- Modify: `src/components/admin/BillingPage.tsx:1-20` (imports), `:199-203` (`revenueCards`), `:278-290` (stat card JSX), `:359-403` (donut card JSX)
- Test: `src/components/admin/BillingPage.test.tsx` (existing — must still pass unmodified)

**Interfaces:**
- Consumes: `StatCard` from Task 1, `PaymentStatusDonut`/`DonutSegment` from Task 2.
- No change to this file's own exports, data-fetching, or the `TxRow`/`Invoice` types — only presentation of the cards and donut changes.

- [ ] **Step 1: Confirm the existing test currently passes (baseline)**

Run: `npx vitest run src/components/admin/BillingPage.test.tsx`
Expected: PASS (2 tests) — this is the safety net for this refactor.

- [ ] **Step 2: Swap imports**

In `src/components/admin/BillingPage.tsx`, replace the `PieChart` icon import (still needed for the card title icon) and add the two new component imports. Change line 6-8 from:

```tsx
import {
  CreditCard, TrendingUp, Calendar, IndianRupee, PieChart, Download,
  FileText, Eye, Loader2,
} from "lucide-react";
```

to:

```tsx
import {
  CreditCard, TrendingUp, Calendar, IndianRupee, PieChart, Download,
  FileText, Eye, Loader2,
} from "lucide-react";
import StatCard from "@/components/shared/StatCard";
import PaymentStatusDonut, { type DonutSegment } from "@/components/shared/PaymentStatusDonut";
```

- [ ] **Step 3: Replace the stat-card grid (lines 278-290)**

Replace:

```tsx
      <div className="grid sm:grid-cols-3 gap-4">
        {revenueCards.map((r) => (
          <Card key={r.label} className="border-0 shadow-none overflow-hidden">
            <CardContent className={`p-5 bg-gradient-to-br ${r.gradient} text-white relative`}>
              <div className="absolute top-3 right-3 opacity-20"><r.icon className="h-12 w-12" /></div>
              <div className="relative z-10">
                <div className="text-sm font-medium text-white/80">{r.label}</div>
                <div className="font-heading font-extrabold text-2xl mt-1">₹{r.value.toLocaleString("en-IN")}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
```

with:

```tsx
      <div className="grid sm:grid-cols-3 gap-4">
        {revenueCards.map((r) => (
          <StatCard key={r.label} label={r.label} value={`₹${r.value.toLocaleString("en-IN")}`} icon={r.icon} gradient={r.gradient} />
        ))}
      </div>
```

- [ ] **Step 4: Replace the hand-rolled SVG donut (lines 359-403)**

Replace the whole `<Card>...Payment Status...</Card>` block (from `<Card className="border-border/60 shadow-none">` right before `<PieChart className="h-4 w-4 text-royal" />` through its closing `</Card>`, i.e. lines 359-403) with:

```tsx
            <Card className="border-border/60 shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <PieChart className="h-4 w-4 text-royal" /> Payment Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PaymentStatusDonut
                  total={totalCount}
                  buckets={
                    [
                      { label: "Paid", count: paidCount, color: "hsl(var(--success))" },
                      { label: "Pending", count: pendingCount, color: "hsl(var(--warning))" },
                      { label: "Pay at Clinic", count: clinicCount, color: "hsl(var(--royal))" },
                      { label: "Refunded", count: refundedCount, color: "hsl(var(--destructive))" },
                    ] satisfies DonutSegment[]
                  }
                />
              </CardContent>
            </Card>
```

Note: `totalCount` at line 183 is `transactions.length || 1` (guards the old SVG's division-by-zero math). `PaymentStatusDonut` doesn't divide, so this is safe to pass through unchanged — no edit needed to that line.

- [ ] **Step 5: Run the existing test to verify it still passes**

Run: `npx vitest run src/components/admin/BillingPage.test.tsx`
Expected: PASS (2 tests) — same assertions as the Step 1 baseline, now against the refactored render output.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/BillingPage.tsx
git commit -m "refactor: admin BillingPage uses shared StatCard and PaymentStatusDonut"
```

---

### Task 5: Rewrite `SABilling.tsx` for subscription revenue

**Files:**
- Modify (full rewrite): `src/components/superadmin/SABilling.tsx`
- Test: `src/components/superadmin/SABilling.test.tsx`

**Interfaces:**
- Consumes: `StatCard` (Task 1), `PaymentStatusDonut`/`DonutSegment` (Task 2), `bucketPaymentStatus`/`computeRevenueTotals`/`computeEstimatedMRR`/`PaymentTxnStatus`/`PaymentStatusBucket` (Task 3), `TestModeBadge` (existing, `src/components/shared/TestModeBadge.tsx`, default export, no props required).
- Data: `supabase.from("plan_upgrade_payments").select("id, doctor_id, from_tier, target_tier, amount, status, is_mock, created_at, profiles(full_name, email)")`; `supabase.from("profiles").select("plan_status, plan_tier, custom_plan_price")`.
- No change to routing — `src/App.tsx:62` (`<Route path="billing" element={<SABilling />} />`) already points at this file; no edit needed there.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/superadmin/SABilling.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SABilling from "./SABilling";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
    removeChannel: vi.fn(),
  },
}));

const mockData = (payments: any[], profiles: any[]) => {
  const chain = (resolved: any): any => ({
    select: () => chain(resolved),
    order: () => Promise.resolve(resolved),
  });
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === "plan_upgrade_payments") return chain({ data: payments });
    if (table === "profiles") return chain({ data: profiles });
    return chain({ data: [] });
  });
};

describe("SABilling", () => {
  beforeEach(() => {
    vi.mocked(supabase.from).mockReset();
  });

  it("shows ₹0 cards and an empty state with no leftover patient-billing copy", async () => {
    mockData([], []);
    render(<SABilling />);
    expect(await screen.findByText(/no subscription payments yet/i)).toBeInTheDocument();
    expect(screen.getAllByText("₹0").length).toBeGreaterThan(0);
    expect(screen.queryByText(/patient billing volume/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/once razorpay is connected/i)).not.toBeInTheDocument();
  });

  it("renders a transaction row with the doctor name, tier change, and bucketed status badge", async () => {
    mockData(
      [
        {
          id: "p1",
          doctor_id: "d1",
          from_tier: "free",
          target_tier: "pro",
          amount: 1499,
          status: "captured",
          is_mock: false,
          created_at: new Date().toISOString(),
          profiles: { full_name: "Dr. Asha", email: "asha@example.com" },
        },
      ],
      []
    );
    render(<SABilling />);
    expect(await screen.findByText("Dr. Asha")).toBeInTheDocument();
    expect(screen.getByText(/free.*pro/i)).toBeInTheDocument();
    expect(screen.getByText("Paid")).toBeInTheDocument();
  });

  it("shows a mock badge for is_mock payments", async () => {
    mockData(
      [
        {
          id: "p1",
          doctor_id: "d1",
          from_tier: "pro",
          target_tier: "premium",
          amount: 2500,
          status: "captured",
          is_mock: true,
          created_at: new Date().toISOString(),
          profiles: { full_name: "Dr. Mock", email: "" },
        },
      ],
      []
    );
    render(<SABilling />);
    await screen.findByText("Dr. Mock");
    expect(screen.getByText(/test mode/i)).toBeInTheDocument();
  });

  it("shows an Invoices placeholder tab", async () => {
    mockData([], []);
    render(<SABilling />);
    await screen.findByText(/no subscription payments yet/i);
    fireEvent.click(screen.getByRole("tab", { name: /invoices/i }));
    expect(await screen.findByText(/subscription invoicing is coming soon/i)).toBeInTheDocument();
  });

  it("exports the transaction list as a CSV file", async () => {
    mockData(
      [
        {
          id: "p1",
          doctor_id: "d1",
          from_tier: "free",
          target_tier: "pro",
          amount: 1499,
          status: "captured",
          is_mock: false,
          created_at: new Date().toISOString(),
          profiles: { full_name: "Dr. Asha", email: "asha@example.com" },
        },
      ],
      []
    );
    const createObjectURL = vi.fn(() => "blob:mock-url");
    const revokeObjectURL = vi.fn();
    // jsdom doesn't implement these.
    (global.URL as any).createObjectURL = createObjectURL;
    (global.URL as any).revokeObjectURL = revokeObjectURL;

    render(<SABilling />);
    await screen.findByText("Dr. Asha");
    fireEvent.click(screen.getByRole("button", { name: /export csv/i }));
    expect(createObjectURL).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/superadmin/SABilling.test.tsx`
Expected: FAIL — current `SABilling.tsx` renders the old bar chart/banner, none of the new text or roles exist.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/superadmin/SABilling.tsx
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreditCard, TrendingUp, Calendar, IndianRupee, Wallet, PieChart, Download, FileText } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import StatCard from "@/components/shared/StatCard";
import PaymentStatusDonut, { type DonutSegment } from "@/components/shared/PaymentStatusDonut";
import TestModeBadge from "@/components/shared/TestModeBadge";
import {
  bucketPaymentStatus,
  computeRevenueTotals,
  computeEstimatedMRR,
  type PaymentTxnStatus,
  type PaymentStatusBucket,
} from "@/lib/subscriptionRevenue";

interface UpgradePaymentRow {
  id: string;
  doctor_id: string;
  from_tier: string;
  target_tier: string;
  amount: number;
  status: PaymentTxnStatus;
  is_mock: boolean;
  created_at: string;
  profiles: { full_name: string | null; email: string | null } | null;
}

interface SubscriberProfileRow {
  plan_status: string | null;
  plan_tier: string | null;
  custom_plan_price: number | null;
}

type StatusFilter = "all" | PaymentStatusBucket;
const STATUS_FILTERS: StatusFilter[] = ["all", "Paid", "Pending", "Failed", "Refunded"];

const BADGE_CLASS: Record<PaymentStatusBucket, string> = {
  Paid: "bg-success/10 text-success",
  Pending: "bg-warning/10 text-warning",
  Failed: "bg-destructive/10 text-destructive",
  Refunded: "bg-royal/10 text-royal",
};

const SABilling = () => {
  const [payments, setPayments] = useState<UpgradePaymentRow[]>([]);
  const [subscribers, setSubscribers] = useState<SubscriberProfileRow[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("all");

  const loadPayments = async () => {
    const { data } = await supabase
      .from("plan_upgrade_payments")
      .select("id, doctor_id, from_tier, target_tier, amount, status, is_mock, created_at, profiles(full_name, email)")
      .order("created_at", { ascending: false });
    setPayments((data ?? []) as unknown as UpgradePaymentRow[]);
  };

  const loadSubscribers = async () => {
    const { data } = await supabase.from("profiles").select("plan_status, plan_tier, custom_plan_price");
    setSubscribers((data ?? []) as SubscriberProfileRow[]);
  };

  useEffect(() => {
    loadPayments();
    loadSubscribers();
  }, []);

  // Realtime: keep the platform-wide payment list current without a manual refresh.
  useEffect(() => {
    const channel = supabase
      .channel("sa-billing-plan-upgrade-payments")
      .on("postgres_changes", { event: "*", schema: "public", table: "plan_upgrade_payments" }, () => loadPayments())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = computeRevenueTotals(payments);
  const estimatedMRR = computeEstimatedMRR(subscribers);

  const statCards = [
    { label: "Today's Subscription Revenue", value: `₹${totals.today.toLocaleString("en-IN")}`, icon: Calendar, gradient: "from-royal to-teal" },
    { label: "This Week", value: `₹${totals.week.toLocaleString("en-IN")}`, icon: TrendingUp, gradient: "from-teal to-success" },
    { label: "This Month", value: `₹${totals.month.toLocaleString("en-IN")}`, icon: IndianRupee, gradient: "from-success to-royal" },
    { label: "Estimated MRR", value: `₹${estimatedMRR.toLocaleString("en-IN")}`, icon: Wallet, gradient: "from-spark to-royal" },
  ];

  const bucketed = payments.map((p) => ({ ...p, bucket: bucketPaymentStatus(p.status) }));
  const filtered = filter === "all" ? bucketed : bucketed.filter((p) => p.bucket === filter);

  const bucketCounts: Record<PaymentStatusBucket, number> = { Paid: 0, Pending: 0, Failed: 0, Refunded: 0 };
  bucketed.forEach((p) => {
    bucketCounts[p.bucket] += 1;
  });
  const donutBuckets: DonutSegment[] = [
    { label: "Paid", count: bucketCounts.Paid, color: "hsl(var(--success))" },
    { label: "Pending", count: bucketCounts.Pending, color: "hsl(var(--warning))" },
    { label: "Failed", count: bucketCounts.Failed, color: "hsl(var(--destructive))" },
    { label: "Refunded", count: bucketCounts.Refunded, color: "hsl(var(--royal))" },
  ];

  const exportTransactionsCSV = () => {
    const rows = filtered.map((p) => ({
      "Doctor Name": p.profiles?.full_name || "",
      Email: p.profiles?.email || "",
      "From Tier": p.from_tier,
      "Target Tier": p.target_tier,
      "Amount (INR)": p.amount,
      Status: p.status,
      Mock: p.is_mock ? "yes" : "no",
      Date: p.created_at,
    }));
    if (rows.length === 0) {
      toast({ title: "No transactions to export", variant: "destructive" });
      return;
    }
    const headers = Object.keys(rows[0]);
    const escape = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => escape((r as Record<string, unknown>)[h])).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `doctylia-subscription-revenue-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Transactions exported" });
  };

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((c) => (
          <StatCard key={c.label} {...c} />
        ))}
      </div>

      <Tabs defaultValue="transactions" className="space-y-5">
        <TabsList className="bg-card border border-border h-11">
          <TabsTrigger value="transactions" className="gap-1.5">
            <CreditCard className="h-3.5 w-3.5" /> Transactions
          </TabsTrigger>
          <TabsTrigger value="invoices" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" /> Invoices
          </TabsTrigger>
        </TabsList>

        <TabsContent value="transactions" className="space-y-4">
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="font-heading font-semibold text-lg text-foreground">Transactions</h2>
                <div className="flex items-center gap-2">
                  <Select value={filter} onValueChange={(v) => setFilter(v as StatusFilter)}>
                    <SelectTrigger className="w-44 h-9">
                      <SelectValue placeholder="Payment Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Payments</SelectItem>
                      {STATUS_FILTERS.filter((s) => s !== "all").map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" onClick={exportTransactionsCSV} className="h-9">
                    <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
                  </Button>
                </div>
              </div>

              {filtered.length === 0 ? (
                <Card className="border-border/60 shadow-none">
                  <CardContent className="py-16 text-center">
                    <CreditCard className="h-12 w-12 text-success/20 mx-auto mb-3" />
                    <p className="text-muted-foreground font-medium">No subscription payments yet</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {filtered.map((p) => (
                    <Card key={p.id} className="border-border/60 shadow-none hover:shadow-sm transition-shadow">
                      <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-royal/10 flex items-center justify-center text-sm font-bold text-royal flex-shrink-0">
                            {p.profiles?.full_name?.charAt(0)?.toUpperCase() || "D"}
                          </div>
                          <div>
                            <div className="font-medium text-foreground text-sm">{p.profiles?.full_name || p.doctor_id}</div>
                            <div className="text-xs text-muted-foreground capitalize">
                              {p.from_tier} → {p.target_tier} · {new Date(p.created_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 flex-wrap flex-shrink-0">
                          <Badge variant="outline" className={`text-[10px] ${BADGE_CLASS[p.bucket]}`}>
                            {p.bucket}
                          </Badge>
                          {p.is_mock && <TestModeBadge />}
                          <span className="font-heading font-bold text-foreground">₹{p.amount}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            <Card className="border-border/60 shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <PieChart className="h-4 w-4 text-royal" /> Payment Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PaymentStatusDonut buckets={donutBuckets} total={payments.length} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="invoices">
          <Card className="border-border/60 shadow-none">
            <CardContent className="py-16 text-center">
              <FileText className="h-12 w-12 text-royal/20 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">Subscription invoicing is coming soon</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SABilling;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/superadmin/SABilling.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/superadmin/SABilling.tsx src/components/superadmin/SABilling.test.tsx
git commit -m "feat: rework superadmin billing page to show subscription revenue"
```

---

### Task 6: Full test suite + manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: All tests pass, including `src/components/shared/StatCard.test.tsx`, `src/components/shared/PaymentStatusDonut.test.tsx`, `src/lib/subscriptionRevenue.test.ts`, `src/components/superadmin/SABilling.test.tsx`, and the pre-existing `src/components/admin/BillingPage.test.tsx`.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No new type errors.

- [ ] **Step 3: Manual check in the running app**

Run: `npm run dev`, then as a superadmin:
1. Open `/superadmin/billing`. Confirm the "Patient billing volume" chart and "once Razorpay is connected" banner are gone, and the 4 stat cards, Transactions/Invoices tabs, filter, Export CSV button, and Payment Status donut render (empty-state is fine if no `plan_upgrade_payments` rows exist yet in this environment).
2. If any `plan_upgrade_payments` rows exist (e.g. from testing the self-service upgrade flow via `/admin/settings` → Upgrade), confirm they appear in the Transactions list with the correct doctor name, tier change, bucketed status badge, and — for mock payments — the "Test Mode" badge.
3. Change the status filter dropdown and confirm the list updates; click Export CSV and confirm a `.csv` file downloads.
4. Open `/admin/billing` as a Premium-tier doctor and confirm the stat cards and Payment Status donut still render exactly as before (visual regression check against the reference screenshot) — this page's own data/behavior should be unchanged, only its internals were refactored.
5. Compare `/superadmin/billing` and `/admin/billing` side by side and confirm the stat-card and donut styling now visually match (shared components).

- [ ] **Step 4: Report results**

Note any visual or behavioral discrepancies found during manual verification; fix and re-run Steps 1-3 before considering the feature complete.

---
