# Payments & Payouts Tabs Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `SAPayments.tsx`'s Overview, All Payments, and Doctor-wise Earnings tabs per the approved design — no changes to Payouts/Payout History (items 4-5, explicitly deferred).

**Architecture:** `DoctorGroupCard` is promoted from `SAModeration.tsx` to `src/components/shared/` (it gains a second consumer here). `loadData()` gains an `appointments` fetch so payments can be joined to patient identity client-side. Each tab's redesign is its own task against the shared, already-loaded `payments`/`ledger`/`payouts`/`profiles`/`appointments` state — no new tables, no schema changes.

**Tech Stack:** React + TypeScript, shadcn `Card`/`Badge`/`Collapsible` (already in the codebase), `date-fns` (already used in this file), no new dependencies.

## Global Constraints

- No changes to `calculate-monthly-earnings`, `create-doctor-payout`, or the Payouts/Payout History tabs.
- No schema changes — patient identity for the All Payments drill-down comes from `appointments.patient_name`/`patient_phone`, joined client-side via `payments.appointment_id`.
- `payoutStatusStyle` stays (used by Overview's new breakdown and the untouched Payouts/History tabs). `paymentStatusStyle`, `refundPayment`, the `refunding` state, and the `Undo2` icon import become genuinely unused once All Payments' status badges and Refund button are removed (no other tab in this file uses them) — removed as dead code in Task 4, correcting the design spec's assumption that they'd still be needed elsewhere.
- The orphaned-payment indicator (captured payment with no linked appointment, currently shown as a destructive-bordered card + "Needs Refund Review" badge) is a data-integrity signal, not a routine status tag — kept, but only on Level 3 transaction rows in the redesigned All Payments tab.

---

### Task 1: Promote `DoctorGroupCard` to `src/components/shared/`

**Files:**
- Create: `src/components/shared/DoctorGroupCard.tsx`
- Test: `src/components/shared/DoctorGroupCard.test.tsx`
- Modify: `src/components/superadmin/SAModeration.tsx` (remove the local definition, import from the new location)

**Interfaces:**
- Produces: `DoctorGroupCard` (default export from the new file), props `{ doctorName: string; clinicName: string | null; count: number; itemLabel: string; children: React.ReactNode }` — identical to its current shape in `SAModeration.tsx`, this is a pure relocation.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/shared/DoctorGroupCard.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DoctorGroupCard from "./DoctorGroupCard";

describe("DoctorGroupCard", () => {
  it("renders collapsed by default, with children hidden until the header is clicked", async () => {
    render(
      <DoctorGroupCard doctorName="Dr. A" clinicName="A Clinic" count={3} itemLabel="transaction">
        <div>Detail content</div>
      </DoctorGroupCard>
    );
    expect(screen.getByText("Dr. A")).toBeInTheDocument();
    expect(screen.getByText(/3 transactions/i)).toBeInTheDocument();
    expect(screen.queryByText("Detail content")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Dr. A"));
    expect(await screen.findByText("Detail content")).toBeInTheDocument();
  });

  it("singularizes the item label when count is 1", () => {
    render(
      <DoctorGroupCard doctorName="Dr. B" clinicName={null} count={1} itemLabel="review">
        <div>x</div>
      </DoctorGroupCard>
    );
    expect(screen.getByText(/1 review\b/i)).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/shared/DoctorGroupCard.test.tsx`
Expected: FAIL — cannot find module `./DoctorGroupCard`.

- [ ] **Step 3: Create the shared component**

```tsx
// src/components/shared/DoctorGroupCard.tsx
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface DoctorGroupCardProps {
  doctorName: string;
  clinicName: string | null;
  count: number;
  itemLabel: string;
  children: React.ReactNode;
}

const DoctorGroupCard = ({ doctorName, clinicName, count, itemLabel, children }: DoctorGroupCardProps) => {
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

export default DoctorGroupCard;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/shared/DoctorGroupCard.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Update `SAModeration.tsx` to import instead of define**

In `src/components/superadmin/SAModeration.tsx`, remove the entire local `export const DoctorGroupCard = (...) => { ... };` block (currently right after the imports), and change the import section from:

```tsx
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
```

to:

```tsx
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import DoctorGroupCard from "@/components/shared/DoctorGroupCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
```

(`CardHeader`/`CardTitle`/`Collapsible*`/`ChevronDown` were only used by the now-removed local `DoctorGroupCard` — `Card`/`CardContent` are still used directly for the "No posts."/"No reviews." empty states.)

- [ ] **Step 6: Run `SAModeration.test.tsx` to verify no regression**

Run: `npx vitest run src/components/superadmin/SAModeration.test.tsx`
Expected: PASS (4 tests) — same assertions as before, now against the imported component.

- [ ] **Step 7: Commit**

```bash
git add src/components/shared/DoctorGroupCard.tsx src/components/shared/DoctorGroupCard.test.tsx src/components/superadmin/SAModeration.tsx
git commit -m "refactor: promote DoctorGroupCard to shared components"
```

---

### Task 2: Data layer — join payments to patient identity

**Files:**
- Modify: `src/components/superadmin/SAPayments.tsx`

**Interfaces:**
- Produces: `appointments: AppointmentLite[]` state, `appointmentById: Map<string, AppointmentLite>` (rebuilt each render — cheap, matches this file's existing pattern of deriving lookups inline rather than memoizing), `type AppointmentLite = { id: string; doctor_id: string; patient_name: string | null; patient_phone: string | null; created_at: string }`. `doctorLabel(id)` now returns `full_name` only (previously preferred `clinic_name`).

- [ ] **Step 1: Add the `AppointmentLite` type and `appointments` state**

Find:

```tsx
type Payment = Tables<"payments">;
type Ledger = Tables<"doctor_ledger">;
type Payout = Tables<"payouts">;
type ProfileLite = { id: string; full_name: string | null; clinic_name: string | null };
```

Replace with:

```tsx
type Payment = Tables<"payments">;
type Ledger = Tables<"doctor_ledger">;
type Payout = Tables<"payouts">;
type ProfileLite = { id: string; full_name: string | null; clinic_name: string | null };
type AppointmentLite = { id: string; doctor_id: string; patient_name: string | null; patient_phone: string | null; created_at: string };
```

Find:

```tsx
  const [payments, setPayments] = useState<Payment[]>([]);
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
```

Replace with:

```tsx
  const [payments, setPayments] = useState<Payment[]>([]);
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [appointments, setAppointments] = useState<AppointmentLite[]>([]);
```

- [ ] **Step 2: Fetch appointments in `loadData()` and simplify `doctorLabel`**

Find:

```tsx
  const loadData = async () => {
    const [paymentsRes, ledgerRes, payoutsRes, profilesRes] = await Promise.all([
      supabase.from("payments").select("*").order("created_at", { ascending: false }).limit(300),
      supabase.from("doctor_ledger").select("*"),
      supabase.from("payouts").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, clinic_name"),
    ]);
    setPayments(paymentsRes.data || []);
    setLedger(ledgerRes.data || []);
    setPayouts(payoutsRes.data || []);
    const map: Record<string, ProfileLite> = {};
    (profilesRes.data || []).forEach((p) => { map[p.id] = p; });
    setProfiles(map);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const doctorLabel = (id: string) => profiles[id]?.clinic_name || profiles[id]?.full_name || id.slice(0, 8);
```

Replace with:

```tsx
  const loadData = async () => {
    const [paymentsRes, ledgerRes, payoutsRes, profilesRes, appointmentsRes] = await Promise.all([
      supabase.from("payments").select("*").order("created_at", { ascending: false }).limit(300),
      supabase.from("doctor_ledger").select("*"),
      supabase.from("payouts").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, clinic_name"),
      supabase.from("appointments").select("id, doctor_id, patient_name, patient_phone, created_at"),
    ]);
    setPayments(paymentsRes.data || []);
    setLedger(ledgerRes.data || []);
    setPayouts(payoutsRes.data || []);
    const map: Record<string, ProfileLite> = {};
    (profilesRes.data || []).forEach((p) => { map[p.id] = p; });
    setProfiles(map);
    setAppointments((appointmentsRes.data || []) as AppointmentLite[]);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const doctorLabel = (id: string) => profiles[id]?.full_name || id.slice(0, 8);
  const appointmentById = new Map(appointments.map((a) => [a.id, a]));
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors. `appointmentById` and `AppointmentLite` are unused until Task 4 wires them in — that's expected at this point (`noUnusedLocals` is `false` in this project's `tsconfig.json`, confirmed, so this doesn't fail the build).

- [ ] **Step 4: Commit**

```bash
git add src/components/superadmin/SAPayments.tsx
git commit -m "feat: join payments to appointments for patient-level grouping"
```

---

### Task 3: Overview tab — remove chart, add payout status breakdown + top earners

**Files:**
- Modify: `src/components/superadmin/SAPayments.tsx`

**Interfaces:**
- Consumes: `payouts`, `doctorEarnings` (existing computed value, unchanged shape in this task — Task 5 adds a field to it later), `payoutStatusStyle` (existing), `doctorLabel` (Task 2).
- Produces: `payoutStatusCounts: { status: string; count: number }[]`, `topEarners` (first 5 entries of `doctorEarnings`), `topEarnersMax: number`.

- [ ] **Step 1: Remove the recharts import and the `monthlyChart` computation**

Find:

```tsx
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
```

Delete this line entirely — recharts is not used anywhere else in this file after this task.

Find:

```tsx
  const monthlyChart = (() => {
    const byMonth = new Map<string, number>();
    captured.forEach((p) => {
      const key = (p.created_at || "").slice(0, 7);
      byMonth.set(key, (byMonth.get(key) || 0) + Number(p.amount));
    });
    return Array.from(byMonth.entries()).sort().map(([month, total]) => ({ month, total }));
  })();
```

Delete this block entirely.

- [ ] **Step 2: Add `payoutStatusCounts` and `topEarners`**

Find:

```tsx
  const pendingPayouts = payouts.filter((p) => p.status === "pending" || p.status === "processing");
  const payoutHistory = payouts.filter((p) => p.status === "processed" || p.status === "failed" || p.status === "cancelled");
```

Replace with:

```tsx
  const pendingPayouts = payouts.filter((p) => p.status === "pending" || p.status === "processing");
  const payoutHistory = payouts.filter((p) => p.status === "processed" || p.status === "failed" || p.status === "cancelled");

  const payoutStatusCounts = (Object.keys(payoutStatusStyle) as Array<keyof typeof payoutStatusStyle>)
    .map((status) => ({ status, count: payouts.filter((p) => p.status === status).length }))
    .filter((s) => s.count > 0);

  const topEarners = doctorEarnings.slice(0, 5);
  const topEarnersMax = topEarners[0]?.[1].gross ?? 0;
```

- [ ] **Step 3: Replace the Overview tab's chart card with the two new cards**

Find:

```tsx
          <Card>
            <CardHeader><CardTitle className="text-base">Collections — monthly</CardTitle></CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer>
                  <BarChart data={monthlyChart}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="month" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip formatter={(v: number) => `₹${v.toLocaleString("en-IN")}`} />
                    <Bar dataKey="total" fill="hsl(var(--royal))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
```

Replace with:

```tsx
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Payout Status</CardTitle></CardHeader>
              <CardContent>
                {payoutStatusCounts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No payouts calculated yet.</p>
                ) : (
                  <div className="space-y-2">
                    {payoutStatusCounts.map(({ status, count }) => {
                      const style = payoutStatusStyle[status];
                      return (
                        <div key={status} className="flex items-center justify-between text-sm">
                          <Badge variant="outline" className={`text-[10px] ${style.bg} ${style.text}`}>{style.label}</Badge>
                          <span className="font-medium text-foreground">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Top Earning Doctors</CardTitle></CardHeader>
              <CardContent>
                {topEarners.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No earnings yet.</p>
                ) : (
                  <div className="space-y-3">
                    {topEarners.map(([doctorId, e]) => (
                      <div key={doctorId}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-foreground font-medium truncate">{doctorLabel(doctorId)}</span>
                          <span className="text-muted-foreground">₹{e.gross.toLocaleString("en-IN")}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                          <div className="h-full bg-royal rounded-full" style={{ width: `${topEarnersMax ? (e.gross / topEarnersMax) * 100 : 0}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Manual check**

Run `npm run dev`, open `/superadmin/payments` → Overview tab. Confirm no chart renders, and the two new cards show (empty states are fine if there's no data yet — the module doesn't require items 4/5 to be fixed for this task).

- [ ] **Step 6: Commit**

```bash
git add src/components/superadmin/SAPayments.tsx
git commit -m "feat: replace Overview chart with payout status breakdown and top earners"
```

---

### Task 4: All Payments tab — Doctor → Patient → Transaction drill-down

**Files:**
- Modify: `src/components/superadmin/SAPayments.tsx`

**Interfaces:**
- Consumes: `payments`, `appointmentById` (Task 2), `doctorLabel` (Task 2).
- Produces: `drillDoctorId`/`drillPatientKey` state; `paymentsByDoctor`, `patientsForDrillDoctor`, `transactionsForDrillPatient`, `drillPatientName` computed values, scoped to this tab only.

- [ ] **Step 1: Remove now-dead payment-status/refund code**

Find:

```tsx
  Wallet, IndianRupee, PieChart, History, Loader2, Info,
  RefreshCw, Send, Users2, CreditCard, Undo2,
} from "lucide-react";
```

Replace with:

```tsx
  Wallet, IndianRupee, PieChart, History, Loader2, Info,
  RefreshCw, Send, Users2, CreditCard,
} from "lucide-react";
```

Find:

```tsx
const paymentStatusStyle: Record<string, { bg: string; text: string }> = {
  created: { bg: "bg-muted", text: "text-muted-foreground" },
  authorized: { bg: "bg-royal/10", text: "text-royal" },
  captured: { bg: "bg-success/10", text: "text-success" },
  failed: { bg: "bg-destructive/10", text: "text-destructive" },
  refunded: { bg: "bg-warning/10", text: "text-warning" },
};
const payoutStatusStyle: Record<string, { bg: string; text: string; label: string }> = {
```

Replace with:

```tsx
const payoutStatusStyle: Record<string, { bg: string; text: string; label: string }> = {
```

(`paymentStatusStyle` was only used by All Payments' status badge, which this task removes — it has no other consumer in this file.)

Find:

```tsx
  const [runningCalc, setRunningCalc] = useState(false);
  const [payingOut, setPayingOut] = useState<string | null>(null);
  const [refunding, setRefunding] = useState<string | null>(null);
```

Replace with:

```tsx
  const [runningCalc, setRunningCalc] = useState(false);
  const [payingOut, setPayingOut] = useState<string | null>(null);
  const [drillDoctorId, setDrillDoctorId] = useState<string | null>(null);
  const [drillPatientKey, setDrillPatientKey] = useState<string | null>(null);
```

Find the entire `refundPayment` function:

```tsx
  const refundPayment = async (paymentId: string) => {
    setRefunding(paymentId);
    const { data, error } = await supabase.functions.invoke("refund-payment", { body: { payment_id: paymentId } });
    setRefunding(null);
    if (error || !data?.ok) {
      toast.error("Couldn't process refund", {
        description: "Real Razorpay refunds aren't wired up yet — this only works for test-mode payments right now.",
      });
      return;
    }
    toast.success("Payment marked as refunded");
    loadData();
  };
```

Delete this function entirely.

- [ ] **Step 2: Add the drill-down computed values**

Find:

```tsx
  const doctorEarnings = (() => {
```

Insert immediately before it:

```tsx
  const paymentsByDoctor = (() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const p of payments) {
      const row = map.get(p.doctor_id) || { count: 0, total: 0 };
      row.count += 1;
      row.total += Number(p.amount);
      map.set(p.doctor_id, row);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total);
  })();

  const patientKeyFor = (p: Payment) => {
    const appt = p.appointment_id ? appointmentById.get(p.appointment_id) : undefined;
    return appt?.patient_phone || `unknown-${p.id}`;
  };

  const patientsForDrillDoctor = (() => {
    if (!drillDoctorId) return [];
    const map = new Map<string, { patientName: string; count: number; total: number; lastDate: string }>();
    for (const p of payments) {
      if (p.doctor_id !== drillDoctorId) continue;
      const appt = p.appointment_id ? appointmentById.get(p.appointment_id) : undefined;
      const key = patientKeyFor(p);
      const row = map.get(key) || { patientName: appt?.patient_name || "Unknown patient", count: 0, total: 0, lastDate: p.created_at };
      row.count += 1;
      row.total += Number(p.amount);
      if (p.created_at > row.lastDate) row.lastDate = p.created_at;
      map.set(key, row);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total);
  })();

  const transactionsForDrillPatient = (() => {
    if (!drillDoctorId || !drillPatientKey) return [];
    return payments
      .filter((p) => p.doctor_id === drillDoctorId && patientKeyFor(p) === drillPatientKey)
      .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  })();

  const drillPatientName = patientsForDrillDoctor.find(([key]) => key === drillPatientKey)?.[1].patientName;

```

- [ ] **Step 3: Replace the All Payments tab content**

Find the entire `<TabsContent value="payments" ...>...</TabsContent>` block:

```tsx
        <TabsContent value="payments" className="space-y-2">
          {payments.length === 0 ? (
            <EmptyState icon={CreditCard} text="No payments yet" />
          ) : (
            payments.map((p) => {
              const style = paymentStatusStyle[p.status] || paymentStatusStyle.created;
              // Money was captured by Razorpay but no appointment could be created
              // (slot race, or the patient closed the tab before verification) —
              // surface this so it doesn't silently disappear.
              const orphaned = p.status === "captured" && (p.needs_refund || !p.appointment_id);
              return (
                <Card key={p.id} className={`border-border/60 shadow-none hover:shadow-sm transition-shadow ${orphaned ? "border-destructive/40" : ""}`}>
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{doctorLabel(p.doctor_id)}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {p.razorpay_order_id || "—"} · {format(new Date(p.created_at), "d MMM yyyy, h:mm a")}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {p.is_mock && <TestModeBadge />}
                      {orphaned && (
                        <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive">Needs Refund Review</Badge>
                      )}
                      <Badge variant="outline" className={`text-[10px] capitalize ${style.bg} ${style.text}`}>{p.status}</Badge>
                      <span className="font-heading font-bold text-foreground">₹{Number(p.amount).toLocaleString("en-IN")}</span>
                      {p.status === "captured" && (
                        <Button size="sm" variant="outline" className="h-8 text-xs gap-1" disabled={refunding === p.id}
                          onClick={() => refundPayment(p.id)}>
                          <Undo2 className="h-3.5 w-3.5" /> {refunding === p.id ? "Refunding..." : "Refund"}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>
```

Replace with:

```tsx
        <TabsContent value="payments" className="space-y-3">
          <div className="flex items-center gap-1.5 text-sm flex-wrap">
            <button
              className={`hover:underline ${!drillDoctorId ? "font-semibold text-foreground" : "text-royal"}`}
              onClick={() => { setDrillDoctorId(null); setDrillPatientKey(null); }}
            >
              All Doctors
            </button>
            {drillDoctorId && (
              <>
                <span className="text-muted-foreground">›</span>
                <button
                  className={`hover:underline ${!drillPatientKey ? "font-semibold text-foreground" : "text-royal"}`}
                  onClick={() => setDrillPatientKey(null)}
                >
                  {doctorLabel(drillDoctorId)}
                </button>
              </>
            )}
            {drillPatientKey && (
              <>
                <span className="text-muted-foreground">›</span>
                <span className="font-semibold text-foreground">{drillPatientName}</span>
              </>
            )}
          </div>

          <div className="space-y-2">
            {!drillDoctorId ? (
              paymentsByDoctor.length === 0 ? (
                <EmptyState icon={CreditCard} text="No payments yet" />
              ) : (
                paymentsByDoctor.map(([doctorId, s]) => (
                  <Card key={doctorId} className="border-border/60 shadow-none hover:shadow-sm transition-shadow cursor-pointer" onClick={() => setDrillDoctorId(doctorId)}>
                    <CardContent className="p-4 flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-foreground">{doctorLabel(doctorId)}</span>
                      <span className="text-xs text-muted-foreground">{s.count} transaction{s.count === 1 ? "" : "s"} · ₹{s.total.toLocaleString("en-IN")}</span>
                    </CardContent>
                  </Card>
                ))
              )
            ) : !drillPatientKey ? (
              patientsForDrillDoctor.length === 0 ? (
                <EmptyState icon={CreditCard} text="No payments for this doctor" />
              ) : (
                patientsForDrillDoctor.map(([key, s]) => (
                  <Card key={key} className="border-border/60 shadow-none hover:shadow-sm transition-shadow cursor-pointer" onClick={() => setDrillPatientKey(key)}>
                    <CardContent className="p-4 flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-foreground">{s.patientName}</span>
                      <span className="text-xs text-muted-foreground">{s.count} transaction{s.count === 1 ? "" : "s"} · ₹{s.total.toLocaleString("en-IN")} · last {format(new Date(s.lastDate), "d MMM yyyy")}</span>
                    </CardContent>
                  </Card>
                ))
              )
            ) : (
              transactionsForDrillPatient.length === 0 ? (
                <EmptyState icon={CreditCard} text="No transactions" />
              ) : (
                transactionsForDrillPatient.map((p) => {
                  const orphaned = p.status === "captured" && (p.needs_refund || !p.appointment_id);
                  return (
                    <Card key={p.id} className={`border-border/60 shadow-none ${orphaned ? "border-destructive/40" : ""}`}>
                      <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-foreground truncate">{p.razorpay_order_id || "—"}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {format(new Date(p.created_at), "d MMM yyyy, h:mm a")}{p.method ? ` · ${p.method}` : ""}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          {p.is_mock && <TestModeBadge />}
                          {orphaned && (
                            <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive">Needs Refund Review</Badge>
                          )}
                          <span className="font-heading font-bold text-foreground">₹{Number(p.amount).toLocaleString("en-IN")}</span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )
            )}
          </div>
        </TabsContent>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Manual check**

`/superadmin/payments` → All Payments tab. Confirm: Level 1 shows doctor names (not clinic names) with counts/totals; clicking a doctor shows their patients; clicking a patient shows that pair's transactions with no Refund button and no status badge (only the mock badge and, if applicable, the orphaned-payment warning); the breadcrumb navigates back correctly at each level.

- [ ] **Step 6: Commit**

```bash
git add src/components/superadmin/SAPayments.tsx
git commit -m "feat: restructure All Payments into a doctor/patient/transaction drill-down"
```

---

### Task 5: Doctor-wise Earnings tab — `DoctorGroupCard` instead of tags

**Files:**
- Modify: `src/components/superadmin/SAPayments.tsx`

**Interfaces:**
- Consumes: `DoctorGroupCard` (Task 1), `doctorEarnings` (existing, gains a `count` field in this task), `doctorLabel`/`profiles` (Task 2).

- [ ] **Step 1: Import `DoctorGroupCard`**

Find:

```tsx
import { usePaymentMode } from "@/hooks/usePaymentMode";
import TestModeBadge from "@/components/shared/TestModeBadge";
```

Replace with:

```tsx
import { usePaymentMode } from "@/hooks/usePaymentMode";
import TestModeBadge from "@/components/shared/TestModeBadge";
import DoctorGroupCard from "@/components/shared/DoctorGroupCard";
```

- [ ] **Step 2: Add a `count` field to `doctorEarnings`**

Find:

```tsx
  const doctorEarnings = (() => {
    const byDoctor = new Map<string, { gross: number; commission: number; doctorShare: number; unpaid: number }>();
    ledger.forEach((l) => {
      const row = byDoctor.get(l.doctor_id) || { gross: 0, commission: 0, doctorShare: 0, unpaid: 0 };
      row.gross += Number(l.gross_amount);
      row.commission += Number(l.commission_amount);
      row.doctorShare += Number(l.doctor_share);
      if (!l.paid) row.unpaid += Number(l.doctor_share);
      byDoctor.set(l.doctor_id, row);
    });
    return Array.from(byDoctor.entries()).sort((a, b) => b[1].gross - a[1].gross);
  })();
```

Replace with:

```tsx
  const doctorEarnings = (() => {
    const byDoctor = new Map<string, { gross: number; commission: number; doctorShare: number; unpaid: number; count: number }>();
    ledger.forEach((l) => {
      const row = byDoctor.get(l.doctor_id) || { gross: 0, commission: 0, doctorShare: 0, unpaid: 0, count: 0 };
      row.gross += Number(l.gross_amount);
      row.commission += Number(l.commission_amount);
      row.doctorShare += Number(l.doctor_share);
      if (!l.paid) row.unpaid += Number(l.doctor_share);
      row.count += 1;
      byDoctor.set(l.doctor_id, row);
    });
    return Array.from(byDoctor.entries()).sort((a, b) => b[1].gross - a[1].gross);
  })();
```

- [ ] **Step 3: Replace the Doctor-wise Earnings tab content**

Find:

```tsx
        <TabsContent value="doctors" className="space-y-2">
          {doctorEarnings.length === 0 ? (
            <EmptyState icon={Users2} text="No doctor earnings yet" />
          ) : (
            doctorEarnings.map(([doctorId, e]) => (
              <Card key={doctorId} className="border-border/60 shadow-none">
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-sm font-medium text-foreground">{doctorLabel(doctorId)}</div>
                  <div className="flex items-center gap-4 text-xs flex-wrap">
                    <span className="text-muted-foreground">Gross <strong className="text-foreground">₹{e.gross.toLocaleString("en-IN")}</strong></span>
                    <span className="text-muted-foreground">Commission <strong className="text-foreground">₹{e.commission.toLocaleString("en-IN")}</strong></span>
                    <span className="text-muted-foreground">Doctor Share <strong className="text-foreground">₹{e.doctorShare.toLocaleString("en-IN")}</strong></span>
                    <Badge variant="outline" className={`text-[10px] ${e.unpaid > 0 ? "bg-warning/10 text-warning" : "bg-success/10 text-success"}`}>
                      {e.unpaid > 0 ? `₹${e.unpaid.toLocaleString("en-IN")} unpaid` : "Fully paid out"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
```

Replace with:

```tsx
        <TabsContent value="doctors" className="space-y-2">
          {doctorEarnings.length === 0 ? (
            <EmptyState icon={Users2} text="No doctor earnings yet" />
          ) : (
            doctorEarnings.map(([doctorId, e]) => (
              <DoctorGroupCard
                key={doctorId}
                doctorName={doctorLabel(doctorId)}
                clinicName={profiles[doctorId]?.clinic_name ?? null}
                count={e.count}
                itemLabel="transaction"
              >
                <div className="p-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Gross</span>
                    <span className="font-medium text-foreground">₹{e.gross.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Commission</span>
                    <span className="font-medium text-foreground">₹{e.commission.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Doctor Share</span>
                    <span className="font-medium text-foreground">₹{e.doctorShare.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <span className="text-muted-foreground">Unpaid</span>
                    <Badge variant="outline" className={`text-[10px] ${e.unpaid > 0 ? "bg-warning/10 text-warning" : "bg-success/10 text-success"}`}>
                      {e.unpaid > 0 ? `₹${e.unpaid.toLocaleString("en-IN")}` : "Fully paid out"}
                    </Badge>
                  </div>
                </div>
              </DoctorGroupCard>
            ))
          )}
        </TabsContent>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Manual check**

`/superadmin/payments` → Doctor-wise Earnings tab. Confirm: cards show doctor name (not clinic name), total transaction count, collapsed by default; expanding a card reveals gross/commission/doctor share/unpaid, no tag-heavy card face.

- [ ] **Step 6: Full regression pass**

Run: `npx vitest run`
Expected: All tests pass except the pre-existing unrelated `BlogPage.test.tsx`/`PrescriptionSlip.test.tsx` failures (from earlier in this session, unrelated to this work).

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/superadmin/SAPayments.tsx
git commit -m "feat: switch Doctor-wise Earnings to click-to-expand DoctorGroupCard"
```

---
