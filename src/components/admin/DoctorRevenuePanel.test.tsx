import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import DoctorRevenuePanel from "./DoctorRevenuePanel";

const h = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => h.rpc(...a) } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const nums = (o: Record<string, unknown> = {}) => ({
  visits_completed: 0, paid_amount: 0, gst_amount: 0, by_mode: { cash: 0, upi: 0, card: 0, online: 0, other: 0, unrecorded: 0 },
  refunds_count: 0, refunds_amount: 0, no_shows: 0, paid_no_shows_count: 0, paid_no_shows_amount: 0, platform_charge: 0, net: 0, net_after_refunds: 0, ...o,
});
const payload = (unattributed = nums()) => ({
  ok: true, from: "2026-11-01", to: "2026-11-30",
  rows: [
    { practitioner_id: "p1", display_name: "Dr. Asha", is_active: true, ...nums({ visits_completed: 5, paid_amount: 1000, gst_amount: 180, net: 900, by_mode: { cash: 400, upi: 600, card: 0, online: 0, other: 0, unrecorded: 0 } }) },
    { practitioner_id: "p2", display_name: "Dr. Meera", is_active: false, ...nums({ visits_completed: 2, paid_amount: 500, net: 450 }) },
  ],
  unattributed,
  totals: nums({ visits_completed: 7, paid_amount: 1500, gst_amount: 180, net: 1350 }),
});

describe("DoctorRevenuePanel", () => {
  beforeEach(() => { h.rpc.mockReset(); });

  it("loads via get_practitioner_revenue for the given period and shows rows", async () => {
    h.rpc.mockResolvedValue({ data: payload(), error: null });
    render(<DoctorRevenuePanel from="2026-11-01" to="2026-11-30" periodLabel="November 2026" />);
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith("get_practitioner_revenue", { _from: "2026-11-01", _to: "2026-11-30" }));
    expect((await screen.findAllByText("Dr. Asha")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Inactive").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Total").length).toBeGreaterThan(0);
  });

  it("shows an Unattributed row only when it has numbers", async () => {
    h.rpc.mockResolvedValue({ data: payload(), error: null });
    const { unmount } = render(<DoctorRevenuePanel from="2026-11-01" to="2026-11-30" periodLabel="x" />);
    await screen.findAllByText("Dr. Asha");
    expect(screen.queryByText("Unattributed")).not.toBeInTheDocument();
    unmount();
    h.rpc.mockResolvedValue({ data: payload(nums({ paid_amount: 200, net: 200 })), error: null });
    render(<DoctorRevenuePanel from="2026-11-01" to="2026-11-30" periodLabel="x" />);
    expect((await screen.findAllByText("Unattributed")).length).toBeGreaterThan(0);
  });

  it("shows the net-after-refunds column, 2-decimal money and the new footnote", async () => {
    const p = payload();
    p.rows[0].net_after_refunds = 850.5;
    h.rpc.mockResolvedValue({ data: p, error: null });
    render(<DoctorRevenuePanel from="2026-11-01" to="2026-11-30" periodLabel="x" />);
    await screen.findAllByText("Dr. Asha");
    expect(screen.getAllByText("Net after refunds").length).toBeGreaterThan(0);
    expect(screen.getAllByText("₹850.50").length).toBeGreaterThan(0);
    expect(screen.getByText(/revenue is as invoiced; refunds are shown in the month they were made/i)).toBeInTheDocument();
  });

  it("shows an error state when the RPC refuses", async () => {
    h.rpc.mockResolvedValue({ data: { ok: false, error: "RANGE_TOO_LARGE" }, error: null });
    render(<DoctorRevenuePanel from="2025-01-01" to="2026-11-30" periodLabel="x" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/366/);
  });

  it("shows an error state when the call fails", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    render(<DoctorRevenuePanel from="2026-11-01" to="2026-11-30" periodLabel="x" />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("downloads the payout CSV", async () => {
    h.rpc.mockResolvedValue({ data: payload(), error: null });
    let blob: Blob | null = null;
    (URL as any).createObjectURL = vi.fn((b: Blob) => { blob = b; return "blob:x"; });
    (URL as any).revokeObjectURL = vi.fn();
    render(<DoctorRevenuePanel from="2026-11-01" to="2026-11-30" periodLabel="x" />);
    await screen.findAllByText("Dr. Asha");
    fireEvent.click(screen.getByRole("button", { name: /download payout csv/i }));
    expect(blob).not.toBeNull();
    expect((blob as unknown as Blob).size).toBeGreaterThan(50);
  });
});
