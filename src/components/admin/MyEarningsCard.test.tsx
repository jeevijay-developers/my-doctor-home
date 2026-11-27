import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import MyEarningsCard from "./MyEarningsCard";
import { istMonthRange } from "@/lib/practitioners/revenue";

const h = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => h.rpc(...a) } }));

const row = {
  practitioner_id: "p1", display_name: "Dr. Asha", is_active: true, visits_completed: 12, paid_amount: 6000, gst_amount: 0,
  by_mode: { cash: 1000, upi: 2000, card: 500, online: 2500, other: 0, unrecorded: 0 },
  refunds_count: 1, refunds_amount: 300, no_shows: 3, paid_no_shows_count: 2, paid_no_shows_amount: 400, platform_charge: 100, net: 5900, net_after_refunds: 5600,
};

describe("MyEarningsCard", () => {
  beforeEach(() => h.rpc.mockReset());

  it("asks for the current IST month and shows visits, modes, refunds and paid no-shows", async () => {
    h.rpc.mockResolvedValue({ data: { ok: true, from: "a", to: "b", row }, error: null });
    render(<MyEarningsCard />);
    const { from, to } = istMonthRange(new Date());
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith("get_my_practitioner_revenue", { _from: from, _to: to }));
    const card = await screen.findByTestId("my-earnings");
    expect(card).toHaveTextContent("My earnings");
    expect(card).toHaveTextContent("12");
    expect(card).toHaveTextContent("₹6,000");
    expect(card).toHaveTextContent("₹2,000");
    expect(card).toHaveTextContent("₹300");
    expect(card).toHaveTextContent("₹400");
  });

  it("renders nothing when the owner has not enabled it", async () => {
    h.rpc.mockResolvedValue({ data: { ok: false, error: "NOT_ENABLED" }, error: null });
    const { container } = render(<MyEarningsCard />);
    await waitFor(() => expect(h.rpc).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a small message for other errors", async () => {
    h.rpc.mockResolvedValue({ data: { ok: false, error: "FORBIDDEN" }, error: null });
    render(<MyEarningsCard />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("moves to the previous month with the month picker", async () => {
    h.rpc.mockResolvedValue({ data: { ok: true, from: "a", to: "b", row }, error: null });
    render(<MyEarningsCard />);
    await screen.findByTestId("my-earnings");
    const d = new Date(); d.setUTCDate(15); d.setUTCMonth(d.getUTCMonth() - 1);
    const prev = istMonthRange(d);
    fireEvent.click(screen.getByRole("button", { name: /previous month/i }));
    await waitFor(() => expect(h.rpc).toHaveBeenLastCalledWith("get_my_practitioner_revenue", { _from: prev.from, _to: prev.to }));
    expect(screen.getByRole("button", { name: /next month/i })).toBeEnabled();
  });

  it("clears last month's figures while the next month loads", async () => {
    h.rpc.mockResolvedValueOnce({ data: { ok: true, from: "a", to: "b", row }, error: null });
    render(<MyEarningsCard />);
    expect(await screen.findByTestId("my-earnings")).toHaveTextContent("₹6,000");
    h.rpc.mockReturnValueOnce(new Promise(() => {}));
    fireEvent.click(screen.getByRole("button", { name: /previous month/i }));
    const card = screen.getByTestId("my-earnings");
    expect(card).toHaveAttribute("aria-busy", "true");
    expect(card).not.toHaveTextContent("₹6,000");
  });

  it("offers a retry after an error", async () => {
    h.rpc.mockResolvedValueOnce({ data: { ok: false, error: "BOOM" }, error: null });
    render(<MyEarningsCard />);
    await screen.findByRole("alert");
    h.rpc.mockResolvedValueOnce({ data: { ok: true, from: "a", to: "b", row }, error: null });
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() => expect(screen.getByTestId("my-earnings")).toHaveTextContent("₹6,000"));
  });

  it("says there is no activity when the report is ok but has no row", async () => {
    h.rpc.mockResolvedValue({ data: { ok: true, from: "a", to: "b", row: null }, error: null });
    render(<MyEarningsCard />);
    expect(await screen.findByText(/no activity this month/i)).toBeInTheDocument();
  });

  it("shows two decimals for fractional money", async () => {
    h.rpc.mockResolvedValue({ data: { ok: true, from: "a", to: "b", row: { ...row, paid_amount: 1234.5 } }, error: null });
    render(<MyEarningsCard />);
    expect(await screen.findByText("₹1,234.50")).toBeInTheDocument();
  });

  it("cannot go past the current month", async () => {
    h.rpc.mockResolvedValue({ data: { ok: true, from: "a", to: "b", row }, error: null });
    render(<MyEarningsCard />);
    await screen.findByTestId("my-earnings");
    expect(screen.getByRole("button", { name: /next month/i })).toBeDisabled();
  });
});
