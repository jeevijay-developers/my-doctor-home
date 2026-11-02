import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MockCheckoutModal from "./MockCheckoutModal";

const m = vi.hoisted(() => ({ invoke: vi.fn(), toastError: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: m.invoke } } }));
vi.mock("sonner", () => ({ toast: { error: m.toastError } }));
vi.mock("@/components/shared/TestModeBadge", () => ({ default: () => <span>TEST MODE</span> }));

const setup = (over: Record<string, unknown> = {}) => {
  const props = {
    open: true,
    paymentId: "pay-1",
    amount: 750,
    doctorName: "Dr Asha",
    serviceName: "General Consultation",
    dateLabel: "1 Nov 2026",
    timeLabel: "10:00 AM",
    onResult: vi.fn(),
    onFailed: vi.fn(),
    onDismiss: vi.fn(),
    ...over,
  };
  render(<MockCheckoutModal {...(props as any)} />);
  return props;
};

describe("MockCheckoutModal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the amount twice (fee and total), doctor, service and a TEST MODE badge", () => {
    setup();
    expect(screen.getAllByText("₹750")).toHaveLength(2);
    expect(screen.getByText("Dr Asha")).toBeInTheDocument();
    expect(screen.getByText("General Consultation")).toBeInTheDocument();
    expect(screen.getByText("TEST MODE")).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    setup({ open: false });
    expect(screen.queryByText("Mock Payment Gateway")).not.toBeInTheDocument();
  });

  it("successful payment asks the backend for THIS payment id and forwards the signed response", async () => {
    m.invoke.mockResolvedValue({
      data: { razorpay_order_id: "o1", razorpay_payment_id: "pi1", razorpay_signature: "sig" },
      error: null,
    });
    const p = setup();
    fireEvent.click(screen.getByRole("button", { name: /Payment Successful/ }));
    await waitFor(() => expect(p.onResult).toHaveBeenCalledWith({ razorpay_order_id: "o1", razorpay_payment_id: "pi1", razorpay_signature: "sig" }));
    expect(m.invoke).toHaveBeenCalledWith("mock-simulate-payment", { body: { payment_id: "pay-1", result: "success" } });
    expect(p.onFailed).not.toHaveBeenCalled();
  });

  it("backend failure toasts and never reports a payment", async () => {
    m.invoke.mockResolvedValue({ data: null, error: { message: "x" } });
    const p = setup();
    fireEvent.click(screen.getByRole("button", { name: /Payment Successful/ }));
    await waitFor(() => expect(m.toastError).toHaveBeenCalled());
    expect(p.onResult).not.toHaveBeenCalled();
  });

  it("a response without a payment id is treated as failure", async () => {
    m.invoke.mockResolvedValue({ data: { razorpay_order_id: "o1" }, error: null });
    const p = setup();
    fireEvent.click(screen.getByRole("button", { name: /Payment Successful/ }));
    await waitFor(() => expect(m.toastError).toHaveBeenCalled());
    expect(p.onResult).not.toHaveBeenCalled();
  });

  it("failed payment never touches the backend", () => {
    const p = setup();
    fireEvent.click(screen.getByRole("button", { name: /Payment Failed/ }));
    expect(p.onFailed).toHaveBeenCalledWith(expect.stringMatching(/failed/));
    expect(m.invoke).not.toHaveBeenCalled();
  });

  it("buttons are disabled while a simulation is in flight (no double submit)", async () => {
    let resolve!: (v: unknown) => void;
    m.invoke.mockReturnValue(new Promise((r) => (resolve = r)));
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Payment Successful/ }));
    const processing = await screen.findByRole("button", { name: /Processing/ });
    expect(processing).toBeDisabled();
    expect(screen.getByRole("button", { name: /Payment Failed/ })).toBeDisabled();
    resolve({ data: null, error: { message: "x" } });
    await waitFor(() => expect(m.toastError).toHaveBeenCalled());
  });

  it("Cancel dismisses; Run is disabled until a scenario is chosen", () => {
    const p = setup();
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(p.onDismiss).toHaveBeenCalled();
  });
});
