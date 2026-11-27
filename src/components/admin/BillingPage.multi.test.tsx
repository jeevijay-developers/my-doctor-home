import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { istMonthRange } from "@/lib/practitioners/revenue";
import BillingPage from "./BillingPage";

const h = vi.hoisted(() => ({ isMulti: true, canBilling: true, role: "owner" as string, myPid: null as string | null, tables: {} as Record<string, unknown[]>, rpc: vi.fn() }));
const profile = { id: "doctor-1", full_name: "Dr. Test" };

vi.mock("@/hooks/useCustomPlan", () => ({
  useCustomPlan: () => ({ customPlan: null, requests: [], pendingRequest: null, latestDecided: null, loading: false, refetch: () => {} }),
}));
vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({ profile, loading: false, role: h.role, myPractitionerId: h.myPid, can: (k: string) => (k === "billing.view" ? h.canBilling : false) }),
}));
const PRACT = [
  { id: "p1", display_name: "Dr. Asha", is_active: true, is_primary: true, specialization: null },
  { id: "p2", display_name: "Dr. Meera", is_active: true, is_primary: false, specialization: null },
];
vi.mock("@/hooks/usePractitioners", () => ({
  usePractitioners: () => ({
    isMulti: h.isMulti, practitioners: PRACT, active: PRACT, bookable: PRACT,
    byId: (id: string) => PRACT.find((p) => p.id === id),
  }),
}));
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
      from: vi.fn((t: string) => chain({ data: h.tables[t] ?? [] })),
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
    h.isMulti = true; h.canBilling = true; h.role = "owner"; h.myPid = null; h.tables = {};
    h.rpc.mockReset();
    h.rpc.mockResolvedValue({
      data: { ok: true, from: "x", to: "y", rows: [
        { practitioner_id: "p1", display_name: "Dr. Asha", is_active: true, ...z, visits_completed: 3, paid_amount: 1000, net: 900 },
        { practitioner_id: "p2", display_name: "Dr. Meera", is_active: true, ...z, visits_completed: 1, paid_amount: 500, net: 450 },
      ], unattributed: z, totals: { ...z, visits_completed: 4, paid_amount: 1500, net: 1350 } },
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

  const seedInvoices = () => {
    const now = new Date().toISOString();
    const inv = (id: string, patient: string, pid: string | null) => ({
      id, invoice_number: `INV-${id}`, patient_name: patient, service_name: "Consult", amount: 500, gst_rate: 0, gst_amount: 0,
      total_amount: 500, clinic_gstin: null, status: "paid", created_at: now, appointment_id: `a-${id}`, practitioner_id: pid,
    });
    h.tables = { invoices: [inv("1", "Pat One", "p1"), inv("2", "Pat Two", "p2")] };
  };

  it("shows each doctor's earnings strip at the top, above the transactions", async () => {
    render(<MemoryRouter><BillingPage /></MemoryRouter>);
    const strip = await screen.findByTestId("doctor-earnings-strip");
    expect(within(strip).getByText("Dr. Asha")).toBeInTheDocument();
    expect(within(strip).getByText("Main")).toBeInTheDocument();
    expect(within(strip).getByText("Dr. Meera")).toBeInTheDocument();
    expect(within(strip).getByText("₹1,000")).toBeInTheDocument();
    expect(within(strip).getByText("₹500")).toBeInTheDocument();
    const heading = screen.getByRole("heading", { name: "Transactions" });
    expect(strip.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("clicking a doctor filters the whole page, clicking All doctors clears it", async () => {
    seedInvoices();
    render(<MemoryRouter><BillingPage /></MemoryRouter>);
    expect(await screen.findByText("Pat One")).toBeInTheDocument();
    expect(screen.getByText("Pat Two")).toBeInTheDocument();
    const strip = await screen.findByTestId("doctor-earnings-strip");
    fireEvent.click(within(strip).getByRole("button", { name: "Show only Dr. Meera" }));
    await waitFor(() => expect(screen.queryByText("Pat One")).not.toBeInTheDocument());
    expect(screen.getByText("Pat Two")).toBeInTheDocument();
    expect(screen.getByTestId("doctor-filter-banner")).toHaveTextContent("Dr. Meera");
    // The banner names both views so a doctor's card figure is never mistaken for the strip's figure.
    expect(screen.getByTestId("doctor-filter-banner")).toHaveTextContent(/Earnings table above/);
    expect(screen.getByTestId("doctor-filter-banner")).toHaveTextContent(/refunded invoices left out/);
    expect(screen.getByTestId("doctor-filter-banner")).toHaveTextContent(/month it was made/);
    expect(screen.getByText(/All time, paid by patients/)).toBeInTheDocument();
    expect(screen.getByTestId("summary-gross-revenue")).toHaveTextContent("₹500");
    fireEvent.click(within(strip).getByRole("button", { name: "Show all doctors" }));
    expect(await screen.findByText("Pat One")).toBeInTheDocument();
    expect(screen.queryByTestId("doctor-filter-banner")).not.toBeInTheDocument();
    expect(screen.getByTestId("summary-gross-revenue")).toHaveTextContent("₹1,000");
  });

  it("a doctor login sees no earnings strip, no picker, no report call, and only their own invoices", async () => {
    seedInvoices();
    h.role = "doctor"; h.myPid = "p2"; h.canBilling = true;
    render(<MemoryRouter><BillingPage /></MemoryRouter>);
    expect(await screen.findByText("Pat Two")).toBeInTheDocument();
    expect(screen.queryByText("Pat One")).not.toBeInTheDocument();
    expect(screen.queryByTestId("doctor-earnings-strip")).not.toBeInTheDocument();
    expect(screen.queryByTestId("doctor-revenue")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Filter revenue by doctor")).not.toBeInTheDocument();
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("adds a Doctor column name to transaction rows in a multi-doctor clinic", async () => {
    seedInvoices();
    render(<MemoryRouter><BillingPage /></MemoryRouter>);
    expect(await screen.findByText(/Consult · \d{4}-\d{2}-\d{2} · Dr\. Meera/)).toBeInTheDocument();
  });
});
