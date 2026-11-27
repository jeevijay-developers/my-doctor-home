import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import BuyDoctorSeatsDialog from "./BuyDoctorSeatsDialog";

const h = vi.hoisted(() => ({ access: { seat_max: 10, seat_limit: 2 } as Record<string, number>, invoke: vi.fn(), rpc: vi.fn(), refetch: vi.fn(async () => {}), toastError: vi.fn(), toastSuccess: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: h.invoke }, rpc: h.rpc } }));
vi.mock("@/hooks/usePractitioners", () => ({
  usePractitioners: () => ({ refetch: h.refetch, access: h.access }),
}));
vi.mock("@/hooks/usePaymentMode", () => ({ usePaymentMode: () => ({ mode: "mock", isMock: true }) }));
vi.mock("sonner", () => ({ toast: { error: h.toastError, success: h.toastSuccess } }));

const quote = (qty: number) => ({
  data: { ok: true, amount_paise: qty * 49900, unit_price: 499, days_left: 20, period_end: "2026-12-15T10:00:00Z" },
  error: null,
});

const renderDialog = () => render(<BuyDoctorSeatsDialog open onOpenChange={() => {}} />);

describe("BuyDoctorSeatsDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.access = { seat_max: 10, seat_limit: 2 };
    vi.useFakeTimers({ shouldAdvanceTime: true });
    h.rpc.mockImplementation(async (_fn: string, args: { _qty: number }) => quote(args._qty));
  });
  afterEach(() => vi.useRealTimers());

  it("shows the live quote in rupees with the IST end date and the non-refundable note", async () => {
    renderDialog();
    expect(await screen.findByText("₹499")).toBeInTheDocument();
    expect(h.rpc).toHaveBeenCalledWith("get_seat_order_quote", { _qty: 1 });
    expect(screen.getByText(/valid until dec 15, 2026 \(up to 30 days\)/i)).toBeInTheDocument();
    expect(screen.getByText(/non-refundable/i)).toBeInTheDocument();
  });

  it("re-quotes (debounced) when the quantity changes", async () => {
    renderDialog();
    await screen.findByText("₹499");
    fireEvent.click(screen.getByRole("button", { name: /more seats|increase/i }));
    fireEvent.click(screen.getByRole("button", { name: /more seats|increase/i }));
    expect(h.rpc).toHaveBeenCalledTimes(1); // not yet: debounced
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(h.rpc).toHaveBeenLastCalledWith("get_seat_order_quote", { _qty: 3 });
    expect(await screen.findByText("₹1,497")).toBeInTheDocument();
  });

  it.each([
    ["PRICE_NOT_SET", /not available/i],
    ["PLAN_NOT_ELIGIBLE", /active premium plan/i],
    ["SEAT_MAX", /maximum/i],
    ["NOT_ENABLED", /not enabled/i],
    ["FORBIDDEN", /permission/i],
    ["INVALID_QTY", /valid number/i],
  ])("explains quote error %s and disables Pay", async (code, text) => {
    h.rpc.mockResolvedValue({ data: { ok: false, error: code }, error: null });
    renderDialog();
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^pay/i })).toBeDisabled();
  });

  const orderReply = { data: { order_id: "o1", key_id: "k", amount: 49900, currency: "INR", payment_id: "pay-row-1", mode: "mock" }, error: null };
  const simulate = async () => {
    await waitFor(() => expect(screen.getByText(/mock payment gateway/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /payment successful/i }));
  };

  it("pays, verifies, refetches (no reload) and shows a success state; double click orders once", async () => {
    const reloadSpy = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload: reloadSpy });
    h.invoke.mockImplementation(async (fn: string) => {
      if (fn === "create-doctor-seat-order") return orderReply;
      if (fn === "mock-simulate-payment") return { data: { razorpay_order_id: "o1", razorpay_payment_id: "pm1", razorpay_signature: "sig" }, error: null };
      if (fn === "verify-plan-upgrade-payment") return { data: { ok: true, kind: "seats", seat_limit: 3 }, error: null };
      return { data: null, error: new Error("unexpected " + fn) };
    });
    renderDialog();
    await screen.findByText("₹499");
    const pay = screen.getByRole("button", { name: /^pay/i });
    fireEvent.click(pay);
    fireEvent.click(pay);
    await simulate();
    await waitFor(() => expect(h.invoke).toHaveBeenCalledWith("verify-plan-upgrade-payment", {
      body: { payment_id: "pay-row-1", razorpay_order_id: "o1", razorpay_payment_id: "pm1", razorpay_signature: "sig" },
    }));
    expect(h.invoke.mock.calls.filter((c) => c[0] === "create-doctor-seat-order")).toHaveLength(1);
    expect(h.invoke).toHaveBeenCalledWith("create-doctor-seat-order", { body: { qty: 1 } });
    await waitFor(() => expect(h.refetch).toHaveBeenCalled());
    expect(await screen.findByText(/seats added/i)).toBeInTheDocument();
    expect(reloadSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  const payFlow = async (verifyReply: unknown) => {
    h.invoke.mockImplementation(async (fn: string) => {
      if (fn === "create-doctor-seat-order") return orderReply;
      if (fn === "mock-simulate-payment") return { data: { razorpay_order_id: "o1", razorpay_payment_id: "pm1", razorpay_signature: "sig" }, error: null };
      if (fn === "verify-plan-upgrade-payment") return verifyReply;
      return { data: null, error: null };
    });
    renderDialog();
    await screen.findByText("₹499");
    fireEvent.click(screen.getByRole("button", { name: /^pay/i }));
    await simulate();
  };

  it("tells the user when the payment was captured but the seats were not applied (200 body, needs_refund)", async () => {
    await payFlow({ data: { ok: false, code: "plan_lapsed", needs_refund: true, payment_id: "pay_REF1", kind: "seats" }, error: null });
    expect(await screen.findByText(/couldn't add the seats \(your plan has ended\)/i)).toBeInTheDocument();
    expect(screen.getByText(/pay_REF1/)).toBeInTheDocument();
    expect(screen.getByText(/refund or rebook/i)).toBeInTheDocument();
    expect(screen.getByText(/don't pay again/i)).toBeInTheDocument();
    expect(screen.queryByText(/^seats added$/i)).not.toBeInTheDocument();
  });

  it("says the payment is unconfirmed (and refetches) when verification fails with an HTTP error", async () => {
    await payFlow({ data: null, error: new Error("boom") });
    expect(await screen.findByText(/couldn't confirm your payment yet/i)).toBeInTheDocument();
    await waitFor(() => expect(h.refetch).toHaveBeenCalled());
    expect(screen.queryByText(/^seats added$/i)).not.toBeInTheDocument();
  });

  it("does not claim success when ok:true lacks kind seats", async () => {
    await payFlow({ data: { ok: true, plan_tier: "premium" }, error: null });
    expect(await screen.findByText(/couldn't confirm your payment yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/^seats added$/i)).not.toBeInTheDocument();
  });

  it("limits the stepper to seat_max - 1 minus the seats already held", async () => {
    h.access = { seat_max: 5, seat_limit: 3, extra_seats: 1, purchased_seats: 1 }; // 5-1-2 = 2 more
    renderDialog();
    await screen.findByText("₹499");
    const more = screen.getByRole("button", { name: /more seats/i });
    fireEvent.click(more);
    expect(more).toBeDisabled();
  });

  it("shows two decimals for non-integer rupee amounts", async () => {
    h.rpc.mockResolvedValue({ data: { ok: true, amount_paise: 123450, unit_price: 499, days_left: 20, charged_days: 20, period_end: "2026-12-15T10:00:00Z" }, error: null });
    renderDialog();
    expect(await screen.findByText("₹1,234.50")).toBeInTheDocument();
  });

  it("ignores a late quote after the dialog is closed and reopened", async () => {
    let release: (v: unknown) => void = () => {};
    h.rpc.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    const { rerender } = render(<BuyDoctorSeatsDialog open onOpenChange={() => {}} />);
    await waitFor(() => expect(h.rpc).toHaveBeenCalledTimes(1));
    rerender(<BuyDoctorSeatsDialog open={false} onOpenChange={() => {}} />);
    await act(async () => { release(quote(7)); });
    h.rpc.mockImplementation(async (_fn: string, args: { _qty: number }) => quote(args._qty));
    rerender(<BuyDoctorSeatsDialog open onOpenChange={() => {}} />);
    expect(await screen.findByText("₹499")).toBeInTheDocument();
    expect(screen.queryByText("₹3,493")).not.toBeInTheDocument();
  });

  it("shows the backend reason when the order is refused", async () => {
    h.invoke.mockResolvedValue({ data: null, error: Object.assign(new Error("x"), { context: { json: async () => ({ error: "SEAT_MAX" }) } }) });
    renderDialog();
    await screen.findByText("₹499");
    fireEvent.click(screen.getByRole("button", { name: /^pay/i }));
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith(expect.stringMatching(/maximum/i)));
  });
});
