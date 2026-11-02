import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import SAPayments from "./SAPayments";
import { SuperAdminAccessProvider, buildSuperAdminAccess } from "@/contexts/SuperAdminAccessContext";
import type { SAPermissions } from "@/lib/superadminPermissions";
import { createTableMock } from "@/test/tableMock";

const mock = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mock.current.client;
  },
}));
vi.mock("@/hooks/usePaymentMode", () => ({ usePaymentMode: () => ({ mode: "live", isMock: false }) }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const seed = () => {
  const t = mock.current.tables;
  t.payments = {
    data: [
      { id: "p1", doctor_id: "d1", amount: 1000, status: "captured", created_at: "2026-10-10T00:00:00Z", appointment_id: null },
      { id: "p2", doctor_id: "d1", amount: 500, status: "captured", created_at: "2026-10-11T00:00:00Z", appointment_id: null },
      { id: "p3", doctor_id: "d1", amount: 9999, status: "refunded", created_at: "2026-10-12T00:00:00Z", appointment_id: null },
      { id: "p4", doctor_id: "d1", amount: 7777, status: "failed", created_at: "2026-10-12T00:00:00Z", appointment_id: null },
    ],
  };
  t.transfers = {
    data: [
      { id: "t1", doctor_id: "d1", amount: 900, status: "processed", created_at: "2026-10-10T00:00:00Z" },
      { id: "t2", doctor_id: "d1", amount: 100, status: "pending", created_at: "2026-10-10T00:00:00Z" },
      { id: "t3", doctor_id: "d1", amount: 5000, status: "reversed", created_at: "2026-10-10T00:00:00Z" },
    ],
  };
  t.doctor_ledger = {
    data: [
      { id: "l1", doctor_id: "d1", gross_amount: 1000, commission_amount: 100, doctor_share: 900, paid: false, refunded: false },
      { id: "l2", doctor_id: "d1", gross_amount: 500, commission_amount: 50, doctor_share: 450, paid: true, refunded: false },
      { id: "l3", doctor_id: "d1", gross_amount: 9999, commission_amount: 999, doctor_share: 9000, paid: false, refunded: true },
    ],
  };
  t.payouts = {
    data: [
      { id: "po1", doctor_id: "d1", month: "2026-09", total_amount: 2500, status: "pending", is_mock: false, created_at: "2026-10-01T00:00:00Z" },
      { id: "po2", doctor_id: "d1", month: "2026-08", total_amount: 1500, status: "processing", is_mock: false, created_at: "2026-09-01T00:00:00Z" },
      { id: "po3", doctor_id: "d1", month: "2026-07", total_amount: 777, status: "processed", is_mock: false, created_at: "2026-08-01T00:00:00Z" },
    ],
  };
  t.profiles = { data: [{ id: "d1", full_name: "Dr Asha", clinic_name: "Asha Clinic", razorpay_account_status: "active" }] };
  t.appointments = { data: [] };
};

const renderPage = (isOwner: boolean, perms: SAPermissions = {}) =>
  render(
    <SuperAdminAccessProvider value={buildSuperAdminAccess(isOwner, perms)}>
      <SAPayments />
    </SuperAdminAccessProvider>,
  );

const openTab = (name: RegExp) => {
  const tab = screen.getByRole("tab", { name });
  tab.focus();
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
};

describe("SAPayments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.current = createTableMock();
    seed();
  });

  it("shows a spinner first, then the page", async () => {
    const { container } = renderPage(true);
    expect(container.querySelector(".animate-spin")).toBeTruthy();
    await screen.findByText(/Payments & Payouts/);
  });

  it("computes overview money correctly in en-IN format (captured only; refunded ledger excluded)", async () => {
    renderPage(true);
    await screen.findByText("Gross Collected");
    const card = (label: string) => screen.getByText(label).nextElementSibling?.textContent;
    // 1000 + 500 captured; refunded/failed excluded
    expect(card("Gross Collected")).toBe("₹1,500");
    // commission 100 + 50 (refunded ledger row 999 excluded)
    expect(card("Platform Commission")).toBe("₹150");
    // routed: processed 900 + pending 100; reversed excluded
    expect(card("Net Routed to Doctors")).toBe("₹1,000");
    // awaiting legacy payouts: pending 2500 + processing 1500
    expect(card("Awaiting Payout (Legacy)")).toBe("₹4,000");
  });

  it("owner can run the rollup and approve a payout", async () => {
    renderPage(true);
    await screen.findByText("Gross Collected");
    const run = screen.getByRole("button", { name: /Run Monthly Payout Calculation/ });
    expect(run).toBeEnabled();
    mock.current.invoke.mockResolvedValueOnce({ data: { month: "2026-10", doctors: 3 }, error: null });
    fireEvent.click(run);
    await waitFor(() => expect(mock.current.invoke).toHaveBeenCalledWith("calculate-monthly-earnings", { body: {} }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());

    openTab(/Legacy Payouts/);
    const approve = await screen.findAllByRole("button", { name: "Approve & Pay" });
    expect(approve).toHaveLength(2);
    // pending is enabled, processing is not
    expect(approve[0]).toBeEnabled();
    expect(approve[1]).toBeDisabled();
    mock.current.invoke.mockResolvedValueOnce({ data: { ok: true }, error: null });
    fireEvent.click(approve[0]);
    await waitFor(() => expect(mock.current.invoke).toHaveBeenCalledWith("create-doctor-payout", { body: { payout_id: "po1" } }));
  });

  it("reports a failed payout without claiming success", async () => {
    renderPage(true);
    await screen.findByText("Gross Collected");
    openTab(/Legacy Payouts/);
    const approve = await screen.findAllByRole("button", { name: "Approve & Pay" });
    mock.current.invoke.mockResolvedValueOnce({ data: { ok: false }, error: null });
    fireEvent.click(approve[0]);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Payout couldn't be sent", expect.anything()));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("a team member without payments.payout cannot run the rollup or approve payouts", async () => {
    renderPage(false, { "payments.view": true, "payments.refund": true });
    await screen.findByText("Gross Collected");
    expect(screen.getByRole("button", { name: /Run Monthly Payout Calculation/ })).toBeDisabled();
    openTab(/Legacy Payouts/);
    const approve = await screen.findAllByRole("button", { name: "Approve & Pay" });
    for (const b of approve) expect(b).toBeDisabled();
    fireEvent.click(approve[0]);
    expect(mock.current.invoke).not.toHaveBeenCalled();
  });

  it("a team member holding payments.payout can act", async () => {
    renderPage(false, { "payments.view": true, "payments.payout": true });
    await screen.findByText("Gross Collected");
    expect(screen.getByRole("button", { name: /Run Monthly Payout Calculation/ })).toBeEnabled();
  });

  it("payout history lists only finished payouts with ₹ amounts", async () => {
    renderPage(true);
    await screen.findByText("Gross Collected");
    openTab(/Payout History/);
    expect(await screen.findByText("₹777")).toBeInTheDocument();
  });
});
