import "./__test__/intersectionObserverVisibleStub";
import { continueWithTime, dateField, pickTomorrow, timeField } from "./__test__/bookingFlow";
// Online-payment edge states of the booking wizard: gateway failure, dismissing the checkout,
// an abandoned order being reused, order-creation errors, and "paid but not confirmed".
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import BookingWidget from "./BookingWidget";
import { createTableMock } from "@/test/tableMock";

const mock = vi.hoisted(() => ({ current: null as any }));
const h = vi.hoisted(() => ({
  doctor: {} as any,
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastInfo: vi.fn(),
  refresh: vi.fn(async () => ({})),
}));

vi.mock("@/integrations/supabase/client", () => ({ get supabase() { return mock.current.client; } }));
vi.mock("@/contexts/DoctorContext", () => ({ useDoctorData: () => h.doctor }));
vi.mock("@/hooks/usePaymentMode", () => ({ usePaymentMode: () => ({ mode: "live", isMock: false }) }));
vi.mock("@/hooks/useSlotAvailability", () => ({
  useSlotAvailability: () => ({ counts: {}, isFull: () => false, bookedIn: () => 0, refresh: h.refresh }),
}));
vi.mock("sonner", () => ({ toast: { error: h.toastError, success: h.toastSuccess, info: h.toastInfo } }));
vi.mock("./motion/useSplitReveal", () => ({ useSplitReveal: () => {} }));
vi.mock("./motion/scroll", () => ({ dsScrollTo: vi.fn(), dsScrollToTop: vi.fn() }));
vi.mock("./AppointmentSlip", () => ({ default: () => null }));
vi.mock("./PaymentSlip", () => ({ default: () => null }));
vi.mock("./MockCheckoutModal", () => ({ default: () => null }));
vi.mock("@/lib/downloadPdfFromNode", () => ({ downloadPdfFromNode: vi.fn() }));
vi.mock("@/lib/razorpayCheckout", () => ({ loadRazorpayCheckout: vi.fn(async () => undefined) }));

const allDaysOpen = Array.from({ length: 7 }, (_, d) => ({
  day_of_week: d, is_open: true, start_time: "09:00", end_time: "12:00", start_time_2: null, end_time_2: null,
}));

// The fake Razorpay constructor: captures the options and lets a test fire handler / failure / dismiss.
type RzpOpts = { handler: (r: unknown) => unknown; modal: { ondismiss: () => void }; order_id: string };
const rz = { instances: [] as RzpOpts[], failCb: null as null | ((r: unknown) => void), opened: 0 };

const ORDER = { payment_id: "pay-1", order_id: "order_1", key_id: "rzp_test_x", amount: 75000, currency: "INR", mode: "live" };
const RESPONSE = { razorpay_order_id: "order_1", razorpay_payment_id: "pay_rzp_1", razorpay_signature: "sig" };
const VERIFIED = {
  ok: true,
  appointment: { id: "appt-1", token_number: "TOK1234", created_at: "2026-11-02T10:00:00Z" },
  payment: { amount: 750 },
};

const invokeBy = (handlers: Record<string, () => unknown>) =>
  mock.current.invoke.mockImplementation(async (fn: string) => (handlers[fn] ? handlers[fn]() : { data: null, error: null }));

async function gotoReview() {
  await pickTomorrow();
  await screen.findByRole("heading", { name: "Select Time Slot" });
  await waitFor(() => expect(timeField()).toHaveTextContent("09:00 AM"));
  continueWithTime();
  await screen.findByLabelText(/^Full name/);
  fireEvent.change(screen.getByLabelText(/^Full name/), { target: { value: "Ravi Kumar" } });
  fireEvent.change(screen.getByLabelText(/^Mobile number/), { target: { value: "9876500001" } });
  fireEvent.change(screen.getByLabelText(/^Age/), { target: { value: "40" } });
  fireEvent.change(screen.getByLabelText(/^Gender/), { target: { value: "male" } });
  fireEvent.change(screen.getByLabelText(/^Reason for visit/), { target: { value: "Headache for three days" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("heading", { name: /Review Booking Summary/ });
}
const payNow = () => fireEvent.click(screen.getByRole("button", { name: "Pay Now" }));
const orderCalls = () => mock.current.invoke.mock.calls.filter((c: any[]) => c[0] === "create-razorpay-order");
const verifyCalls = () => mock.current.invoke.mock.calls.filter((c: any[]) => c[0] === "verify-razorpay-payment");

describe("BookingWidget online payment edge states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rz.instances = []; rz.failCb = null; rz.opened = 0;
    (window as any).Razorpay = function (this: any, opts: RzpOpts) {
      rz.instances.push(opts);
      this.on = (evt: string, cb: (r: unknown) => void) => { if (evt === "payment.failed") rz.failCb = cb; };
      this.open = () => { rz.opened++; };
    };
    h.doctor = {
      profile: {
        id: "doc-1", full_name: "Asha Rao", consultation_fee: 750, slug: "asha",
        razorpay_payment_enabled: true, razorpay_account_status: "active",
      },
      services: [],
      settings: { booking_advance_days: 7, slot_duration_minutes: 30, require_payment: true },
      workingHours: allDaysOpen,
      isPremium: false,
      hasFeature: () => false,
    };
    mock.current = createTableMock();
    invokeBy({
      "create-razorpay-order": () => ({ data: ORDER, error: null }),
      "verify-razorpay-payment": () => ({ data: VERIFIED, error: null }),
    });
  });

  it("opens Razorpay with the server's order; no appointment is written client-side", async () => {
    render(<BookingWidget />);
    await gotoReview();
    payNow();
    await waitFor(() => expect(rz.opened).toBe(1));
    expect(rz.instances[0].order_id).toBe("order_1");
    expect(orderCalls()).toHaveLength(1);
    expect(mock.current.opsOf("appointments").filter((q: any) => q.ops.some((o: any[]) => o[0] === "insert"))).toHaveLength(0);
    expect(verifyCalls()).toHaveLength(0);
  });

  it("dismissing the checkout keeps the review step and reuses the same order on the next Pay Now", async () => {
    render(<BookingWidget />);
    await gotoReview();
    payNow();
    await waitFor(() => expect(rz.opened).toBe(1));
    act(() => rz.instances[0].modal.ondismiss());
    await waitFor(() => expect(h.toastInfo).toHaveBeenCalledWith("Payment cancelled.", expect.anything()));
    expect(screen.getByRole("button", { name: "Pay Now" })).not.toBeDisabled();
    expect(screen.queryByText("Payment Failed")).not.toBeInTheDocument();
    payNow();
    await waitFor(() => expect(rz.opened).toBe(2));
    expect(orderCalls()).toHaveLength(1); // abandoned order reused, no second payments row
    expect(verifyCalls()).toHaveLength(0);
  });

  it("changing details after abandoning an order drops it so a fresh order is created", async () => {
    render(<BookingWidget />);
    await gotoReview();
    payNow();
    await waitFor(() => expect(rz.opened).toBe(1));
    act(() => rz.instances[0].modal.ondismiss());
    fireEvent.click(screen.getAllByRole("button", { name: "Back" })[1]); // step 5 -> 4 (the in-form Back)
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: /Review Booking Summary/ });
    payNow();
    await waitFor(() => expect(rz.opened).toBe(2));
    expect(orderCalls()).toHaveLength(2);
  });

  it("payment.failed shows the failure screen with the gateway's reason and 'not charged' copy", async () => {
    render(<BookingWidget />);
    await gotoReview();
    payNow();
    await waitFor(() => expect(rz.failCb).toBeTruthy());
    act(() => rz.failCb!({ error: { description: "Card declined by bank" } }));
    expect(await screen.findByText("Card declined by bank")).toBeInTheDocument();
    expect(screen.getByText(/you were not charged/i)).toBeInTheDocument();
    expect(verifyCalls()).toHaveLength(0);
  });

  it("Retry Payment after a failure reuses the cached order", async () => {
    render(<BookingWidget />);
    await gotoReview();
    payNow();
    await waitFor(() => expect(rz.failCb).toBeTruthy());
    act(() => rz.failCb!({}));
    expect(await screen.findByText(/could not be completed/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry Payment" }));
    await waitFor(() => expect(rz.opened).toBe(2));
    expect(orderCalls()).toHaveLength(1);
  });

  it("a successful checkout is verified server-side and then confirms the booking", async () => {
    render(<BookingWidget />);
    await gotoReview();
    payNow();
    await waitFor(() => expect(rz.opened).toBe(1));
    await act(async () => { await rz.instances[0].handler(RESPONSE); });
    expect(verifyCalls()).toHaveLength(1);
    expect(verifyCalls()[0][1].body).toEqual({
      payment_id: "pay-1", razorpay_order_id: "order_1", razorpay_payment_id: "pay_rzp_1", razorpay_signature: "sig",
    });
    expect(await screen.findByText("Booking Successful!")).toBeInTheDocument();
    expect(h.toastSuccess).toHaveBeenCalled();
  });

  it("paid but verification fails: warns not to pay again and offers 'Check payment status' (no retry)", async () => {
    invokeBy({
      "create-razorpay-order": () => ({ data: ORDER, error: null }),
      "verify-razorpay-payment": () => ({ data: null, error: { context: { status: 500, json: async () => ({ error: "boom" }) } } }),
    });
    render(<BookingWidget />);
    await gotoReview();
    payNow();
    await waitFor(() => expect(rz.opened).toBe(1));
    await act(async () => { await rz.instances[0].handler(RESPONSE); });
    expect(await screen.findByText(/do NOT pay again/i)).toBeInTheDocument();
    expect(screen.getByText(/pay_rzp_1/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry Payment" })).not.toBeInTheDocument();

    // Server recovers: re-checking confirms the booking with the SAME payment ids, no new order.
    invokeBy({ "verify-razorpay-payment": () => ({ data: VERIFIED, error: null }) });
    fireEvent.click(screen.getByRole("button", { name: "Check payment status" }));
    expect(await screen.findByText("Booking Successful!")).toBeInTheDocument();
    expect(orderCalls()).toHaveLength(1);
  });

  it("order creation failure shows a toast and stays on review (nothing opened)", async () => {
    invokeBy({ "create-razorpay-order": () => ({ data: null, error: { context: { status: 500, json: async () => ({ error: "nope" }) } } }) });
    render(<BookingWidget />);
    await gotoReview();
    payNow();
    await waitFor(() => expect(h.toastError).toHaveBeenCalled());
    expect(rz.opened).toBe(0);
    expect(screen.getByRole("button", { name: "Pay Now" })).not.toBeDisabled();
  });

  it("a clinic without active online payments shows no warning up front, and says why only when the booking fails", async () => {
    h.doctor.profile = { ...h.doctor.profile, razorpay_payment_enabled: false, razorpay_account_status: "pending" };
    invokeBy({
      "create-razorpay-order": () => ({
        data: null,
        error: { context: { status: 400, json: async () => ({ error: "Online payment is not active for this doctor yet. Please contact the clinic to book." }) } },
      }),
    });
    render(<BookingWidget />);
    await screen.findByRole("heading", { name: "Select Date" });
    expect(screen.queryByText(/not yet active/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await gotoReview();
    payNow();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Booking not completed");
    expect(alert).toHaveTextContent(/Online payment isn't active for this clinic yet/);
    expect(h.toastError).toHaveBeenCalledWith("Booking not completed", expect.anything());
    expect(rz.opened).toBe(0);
  });

  it("SLOT_FULL from order creation sends the patient back to pick another time", async () => {
    invokeBy({ "create-razorpay-order": () => ({ data: null, error: { context: { status: 409, json: async () => ({ error: "SLOT_FULL" }) } } }) });
    render(<BookingWidget />);
    await gotoReview();
    payNow();
    expect(await screen.findByRole("heading", { name: "Select Time Slot" })).toBeInTheDocument();
    expect(h.toastError).toHaveBeenCalledWith(expect.stringMatching(/just booked/i));
    expect(rz.opened).toBe(0);
  });

  it("a gateway script load failure toasts and re-enables Pay Now", async () => {
    const { loadRazorpayCheckout } = await import("@/lib/razorpayCheckout");
    vi.mocked(loadRazorpayCheckout).mockRejectedValueOnce(new Error("blocked"));
    render(<BookingWidget />);
    await gotoReview();
    payNow();
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith(expect.stringMatching(/payment gateway/i)));
    expect(rz.opened).toBe(0);
    expect(screen.getByRole("button", { name: "Pay Now" })).not.toBeDisabled();
  });
});
