import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import BillingPage from "./BillingPage";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";

vi.mock("@/hooks/useCustomPlan", () => ({
  useCustomPlan: () => ({ customPlan: null, requests: [], pendingRequest: null, latestDecided: null, loading: false, refetch: () => {} }),
}));
vi.mock("@/hooks/useProfile", () => {
  // Stable identity: BillingPage reloads when `profile` changes. A new object
  // on every render retriggers loadData after the extra ledger/payment queries.
  const profile = { id: "doctor-1", full_name: "Dr. Test" };
  return {
    useProfile: () => ({ profile, loading: false }),
  };
});

vi.mock("@/hooks/useFeatureAccess", () => ({ useFeatureAccess: vi.fn() }));

// LockedFeatureCard (rendered when the feature is locked) nests
// UpgradeCheckoutDialog, which independently calls the real usePlanAccess —
// mock it too so that path doesn't hit supabase.rpc.
vi.mock("@/hooks/usePlanAccess", () => ({
  usePlanAccess: () => ({ isPremium: false, appointmentsCap: 100, appointmentsUsed: 0, nearCap: false, loading: false }),
}));

vi.mock("@/lib/invoicePdf", () => ({ generateInvoicePDF: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => {
  const ordered = (resolved: any): any => ({ order: () => ordered(resolved), range: () => Promise.resolve(resolved), then: (f: any, r: any) => Promise.resolve(resolved).then(f, r) });
  const chain = (resolved: any): any => {
    const promise = Promise.resolve(resolved);
    return Object.assign(promise, {
      select: () => chain(resolved),
      insert: (...a: unknown[]) => { (globalThis as any).__invoiceInsert?.(...a); return chain(resolved); },
      eq: () => chain(resolved),
      order: () => ordered(resolved),
    });
  };
  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === "appointments") return chain({ data: (globalThis as any).__mockAppointments ?? [] });
        return chain({ data: [] });
      }),
      channel: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
      })),
      removeChannel: vi.fn(),
      functions: { invoke: vi.fn().mockResolvedValue({ data: { mode: "mock" }, error: null }) },
    },
  };
});

describe("BillingPage - plan gating", () => {
  it("shows LockedFeatureCard instead of billing content for a Basic-tier doctor", () => {
    vi.mocked(useFeatureAccess).mockReturnValue({ hasFeature: () => false, sourceOf: () => undefined, loading: false, rows: [], refetch: vi.fn() });
    render(
      <MemoryRouter>
        <BillingPage />
      </MemoryRouter>
    );
    expect(screen.getByRole("button", { name: /upgrade now/i })).toBeInTheDocument();
    expect(screen.queryByText(/billing & revenue/i)).not.toBeInTheDocument();
  });

  it("shows real billing content for a Premium doctor", () => {
    vi.mocked(useFeatureAccess).mockReturnValue({ hasFeature: () => true, sourceOf: () => undefined, loading: false, rows: [], refetch: vi.fn() });
    render(
      <MemoryRouter>
        <BillingPage />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { level: 1, name: /^revenue$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /upgrade now/i })).not.toBeInTheDocument();
  });

  it("shows a Test Mode badge for a transaction whose appointment was paid via razorpay_mock", async () => {
    vi.mocked(useFeatureAccess).mockReturnValue({ hasFeature: () => true, sourceOf: () => undefined, loading: false, rows: [], refetch: vi.fn() });
    // Billing's Transactions list defaults to the current month, so the fixture
    // date must fall within it rather than being pinned to a fixed date.
    const today = new Date().toISOString().slice(0, 10);
    (globalThis as any).__mockAppointments = [
      {
        id: "apt-mock-1",
        patient_name: "Test Patient",
        service_name: "Consultation",
        date: today,
        amount: 500,
        payment_status: "pending",
        status: "confirmed",
        payment_gateway: "razorpay_mock",
      },
    ];
    render(
      <MemoryRouter>
        <BillingPage />
      </MemoryRouter>
    );
    expect(await screen.findByText("Test Patient")).toBeInTheDocument();
    expect(screen.getByText(/test mode/i)).toBeInTheDocument();
    (globalThis as any).__mockAppointments = undefined;
  });

  it("splits paid revenue by cash / UPI / card / online and shows the UTR", async () => {
    vi.mocked(useFeatureAccess).mockReturnValue({ hasFeature: () => true, sourceOf: () => undefined, loading: false, rows: [], refetch: vi.fn() });
    const today = new Date().toISOString().slice(0, 10);
    const base = { service_name: "Consultation", date: today, status: "completed" };
    (globalThis as any).__mockAppointments = [
      { ...base, id: "a1", patient_name: "Cash Pat", amount: 300, payment_status: "paid", payment_method: "cash" },
      { ...base, id: "a2", patient_name: "Upi Pat", amount: 500, payment_status: "paid", payment_method: "upi", payment_reference: "412345678901" },
      { ...base, id: "a3", patient_name: "Card Pat", amount: 200, payment_status: "paid", payment_method: "card", payment_reference: "4242" },
      { ...base, id: "a4", patient_name: "Online Pat", amount: 400, payment_status: "paid", payment_method: null, payment_gateway: "razorpay" },
      { ...base, id: "a5", patient_name: "Old Pat", amount: 100, payment_status: "paid", payment_method: null },
      { ...base, id: "a6", patient_name: "Unpaid Pat", amount: 999, payment_status: "pending", payment_method: null },
    ];
    render(<MemoryRouter><BillingPage /></MemoryRouter>);
    await screen.findByText("Upi Pat");

    expect(screen.getByTestId("mode-total-cash")).toHaveTextContent("₹300");
    expect(screen.getByTestId("mode-total-upi")).toHaveTextContent("₹500");
    expect(screen.getByTestId("mode-total-card")).toHaveTextContent("₹200");
    expect(screen.getByTestId("mode-total-online")).toHaveTextContent("₹400");
    expect(screen.getByTestId("mode-total-unrecorded")).toHaveTextContent("₹100");
    // Unpaid money is never counted as collected.
    expect(screen.getByTestId("payment-mode-breakdown")).toHaveTextContent("₹1,500");
    expect(screen.getByText("UPI · 412345678901")).toBeInTheDocument();
    expect(screen.getByText("Card · 4242")).toBeInTheDocument();
    (globalThis as any).__mockAppointments = undefined;
  });

  it("never inserts an invoice client-side (the DB trigger owns it: completed AND paid only)", async () => {
    vi.mocked(useFeatureAccess).mockReturnValue({ hasFeature: () => true, sourceOf: () => undefined, loading: false, rows: [], refetch: vi.fn() });
    const insert = vi.fn();
    (globalThis as any).__invoiceInsert = insert;
    (globalThis as any).__mockAppointments = [
      { id: "apt-p", patient_name: "Paid Pending", service_name: "Consultation", date: new Date().toISOString().slice(0, 10), amount: 500, payment_status: "paid", status: "pending" },
    ];
    render(<MemoryRouter><BillingPage /></MemoryRouter>);
    await screen.findByText("Paid Pending");
    await new Promise((r) => setTimeout(r, 50));
    expect(insert).not.toHaveBeenCalled();
    (globalThis as any).__mockAppointments = undefined;
    (globalThis as any).__invoiceInsert = undefined;
  });

  it("paginates transactions 10 per page and keeps every row reachable", async () => {
    vi.mocked(useFeatureAccess).mockReturnValue({ hasFeature: () => true, sourceOf: () => undefined, loading: false, rows: [], refetch: vi.fn() });
    const today = new Date().toISOString().slice(0, 10);
    (globalThis as any).__mockAppointments = Array.from({ length: 25 }, (_, i) => ({
      id: `p${i}`, patient_name: `Pager ${String(i).padStart(2, "0")}`, service_name: "Consultation", date: today,
      amount: 100, payment_status: "pending", status: "confirmed",
    }));
    render(<MemoryRouter><BillingPage /></MemoryRouter>);
    await screen.findByText("Pager 00");
    const shown = () => screen.queryAllByText(/^Pager \d\d$/).length;
    expect(shown()).toBe(10);

    fireEvent.click(screen.getByRole("link", { name: "2" }));
    await waitFor(() => expect(shown()).toBe(10));
    expect(screen.queryByText("Pager 00")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "3" }));
    await waitFor(() => expect(shown()).toBe(5));

    fireEvent.click(screen.getByRole("link", { name: /previous/i }));
    await waitFor(() => expect(shown()).toBe(10));
    (globalThis as any).__mockAppointments = undefined;
  });
});
