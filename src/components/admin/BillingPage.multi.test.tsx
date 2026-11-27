import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { istMonthRange } from "@/lib/practitioners/revenue";
import BillingPage from "./BillingPage";

const h = vi.hoisted(() => ({ isMulti: true, canBilling: true, rpc: vi.fn() }));
const profile = { id: "doctor-1", full_name: "Dr. Test" };

vi.mock("@/hooks/useCustomPlan", () => ({
  useCustomPlan: () => ({ customPlan: null, requests: [], pendingRequest: null, latestDecided: null, loading: false, refetch: () => {} }),
}));
vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({ profile, loading: false, can: (k: string) => (k === "billing.view" ? h.canBilling : false) }),
}));
vi.mock("@/hooks/usePractitioners", () => ({ usePractitioners: () => ({ isMulti: h.isMulti }) }));
vi.mock("@/hooks/useFeatureAccess", () => ({
  useFeatureAccess: () => ({ hasFeature: () => true, sourceOf: () => undefined, loading: false, rows: [], refetch: vi.fn() }),
}));
vi.mock("@/hooks/usePlanAccess", () => ({
  usePlanAccess: () => ({ isPremium: true, appointmentsCap: 100, appointmentsUsed: 0, nearCap: false, loading: false }),
}));
vi.mock("@/lib/invoicePdf", () => ({ generateInvoicePDF: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => {
  const chain = (resolved: any): any => Object.assign(Promise.resolve(resolved), {
    select: () => chain(resolved), eq: () => chain(resolved), order: () => Promise.resolve(resolved),
  });
  return {
    supabase: {
      from: vi.fn(() => chain({ data: [] })),
      rpc: (...a: unknown[]) => h.rpc(...a),
      channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
      removeChannel: vi.fn(),
      functions: { invoke: vi.fn().mockResolvedValue({ data: { mode: "mock" }, error: null }) },
    },
  };
});

const z = { visits_completed: 0, paid_amount: 0, gst_amount: 0, by_mode: { cash: 0, upi: 0, card: 0, online: 0, other: 0, unrecorded: 0 }, refunds_count: 0, refunds_amount: 0, no_shows: 0, paid_no_shows_count: 0, paid_no_shows_amount: 0, platform_charge: 0, net: 0, net_after_refunds: 0 };

describe("BillingPage - By doctor (multi-doctor)", () => {
  beforeEach(() => {
    h.isMulti = true; h.canBilling = true;
    h.rpc.mockReset();
    h.rpc.mockResolvedValue({
      data: { ok: true, from: "x", to: "y", rows: [{ practitioner_id: "p1", display_name: "Dr. Asha", is_active: true, ...z, visits_completed: 3 }], unattributed: z, totals: z },
      error: null,
    });
  });

  it("loads the report for the selected month and shows it", async () => {
    render(<MemoryRouter><BillingPage /></MemoryRouter>);
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith("get_practitioner_revenue", {
      _from: istMonthRange(new Date()).from, _to: istMonthRange(new Date()).to,
    }));
    expect((await screen.findAllByText("Dr. Asha")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /download payout csv/i })).toBeInTheDocument();
  });

  it("falls back to the IST month (not the browser's) when no period filter is set", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-31T20:00:00Z")); // already 1 Nov in India
    try {
      render(<MemoryRouter><BillingPage /></MemoryRouter>);
      await waitFor(() => expect(h.rpc).toHaveBeenCalledWith("get_practitioner_revenue", { _from: "2026-11-01", _to: "2026-11-30" }));
    } finally { vi.useRealTimers(); }
  });

  it("is absent in a single-doctor clinic and makes no call", async () => {
    h.isMulti = false;
    render(<MemoryRouter><BillingPage /></MemoryRouter>);
    await screen.findByRole("heading", { level: 1, name: /^revenue$/i });
    expect(screen.queryByTestId("doctor-revenue")).not.toBeInTheDocument();
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("is absent without billing.view", async () => {
    h.canBilling = false;
    render(<MemoryRouter><BillingPage /></MemoryRouter>);
    await screen.findByRole("heading", { level: 1, name: /^revenue$/i });
    expect(screen.queryByTestId("doctor-revenue")).not.toBeInTheDocument();
    expect(h.rpc).not.toHaveBeenCalled();
  });
});
