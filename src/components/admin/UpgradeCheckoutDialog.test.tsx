import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import UpgradeCheckoutDialog from "./UpgradeCheckoutDialog";

vi.mock("@/hooks/useCustomPlan", () => ({
  useCustomPlan: () => ({ customPlan: null, requests: [], pendingRequest: null, latestDecided: null, loading: false, refetch: () => {} }),
}));
const { invokeMock, practState, toastWarning } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  toastWarning: vi.fn(),
  practState: { value: { active: [] as unknown[], access: null as null | Record<string, unknown> } as { active: unknown[]; access: null | Record<string, unknown>; isMulti?: boolean; loading?: boolean } },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: toastWarning } }));
vi.mock("@/hooks/usePractitioners", () => ({ usePractitioners: () => practState.value }));

vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({ profile: { plan_tier: "pro", plan_status: "active" }, loading: false }),
}));
vi.mock("@/hooks/usePlanAccess", () => ({
  usePlanAccess: () => ({ isPremium: false, appointmentsCap: 100, appointmentsUsed: 0, nearCap: false, loading: false }),
}));
vi.mock("@/hooks/usePaymentMode", () => ({
  usePaymentMode: () => ({ mode: "mock", isMock: true }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

describe("UpgradeCheckoutDialog", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    practState.value = { active: [], access: null, isMulti: false, loading: false };
    toastWarning.mockReset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens on trigger click and shows the target tier's price and features", () => {
    render(<UpgradeCheckoutDialog targetTier="premium" trigger={<button>Request Upgrade</button>} />);
    fireEvent.click(screen.getByRole("button", { name: "Request Upgrade" }));
    expect(screen.getByText(/online consultation/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pay .*3999.* upgrade/i })).toBeInTheDocument();
  });

  it("creates an order and verifies a successful mock payment, then reloads the page", async () => {
    const reloadSpy = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload: reloadSpy });

    invokeMock.mockImplementation((fn: string) => {
      if (fn === "create-plan-upgrade-order") {
        return Promise.resolve({
          data: { order_id: "order_mock_1", key_id: "mock_key", amount: 399900, currency: "INR", payment_id: "pay-row-1", mode: "mock" },
          error: null,
        });
      }
      if (fn === "verify-plan-upgrade-payment") {
        return Promise.resolve({ data: { ok: true, plan_tier: "premium" }, error: null });
      }
      return Promise.resolve({ data: null, error: new Error("unexpected function " + fn) });
    });

    render(<UpgradeCheckoutDialog targetTier="premium" trigger={<button>Request Upgrade</button>} />);
    fireEvent.click(screen.getByRole("button", { name: "Request Upgrade" }));
    fireEvent.click(screen.getByRole("button", { name: /pay .* upgrade/i }));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("create-plan-upgrade-order", { body: { target_tier: "premium" } }));

    // Mock mode opens MockCheckoutModal instead of real Razorpay Checkout —
    // simulate its "Payment Successful" button.
    await waitFor(() => expect(screen.getByText(/mock payment gateway/i)).toBeInTheDocument());

    invokeMock.mockImplementationOnce((fn: string) => {
      expect(fn).toBe("mock-simulate-payment");
      return Promise.resolve({
        data: { razorpay_order_id: "order_mock_1", razorpay_payment_id: "pay_mock_1", razorpay_signature: "sig_mock_1" },
        error: null,
      });
    });
    fireEvent.click(screen.getByRole("button", { name: /payment successful/i }));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("verify-plan-upgrade-payment", expect.anything()));
    await vi.advanceTimersByTimeAsync(1000);
    await waitFor(() => expect(reloadSpy).toHaveBeenCalled());

    vi.unstubAllGlobals();
  });

  describe("seat-loading gate", () => {
    const open = () => {
      render(<UpgradeCheckoutDialog targetTier="premium" trigger={<button>Request Upgrade</button>} />);
      fireEvent.click(screen.getByRole("button", { name: "Request Upgrade" }));
    };

    it("disables Pay for a multi-doctor clinic while access is still unknown", () => {
      practState.value = { active: [{}, {}], access: null, isMulti: true, loading: true };
      open();
      expect(screen.getByText(/checking your doctor seats/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /pay .* upgrade/i })).toBeDisabled();
    });

    it("does not gate a single-doctor clinic that is still loading", () => {
      practState.value = { active: [{}], access: null, isMulti: false, loading: true };
      open();
      expect(screen.queryByText(/checking your doctor seats/i)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /pay .* upgrade/i })).toBeEnabled();
    });

    it("after 8 seconds allows Pay with a warning that the seats are not included", async () => {
      practState.value = { active: [{}, {}], access: null, isMulti: true, loading: true };
      open();
      await act(async () => { await vi.advanceTimersByTimeAsync(8100); });
      expect(screen.getByText(/extra doctor seats won't be included in this renewal/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /pay .* upgrade/i })).toBeEnabled();
    });

    it("warns when the verify answer says some seats were clamped", async () => {
      vi.stubGlobal("location", { ...window.location, reload: vi.fn() });
      practState.value = { active: [{}, {}], access: { seat_price: 500, seat_max: 6, purchased_seats: 2 }, isMulti: true, loading: false };
      invokeMock.mockImplementation((fn: string) => {
        if (fn === "create-plan-upgrade-order") return Promise.resolve({ data: { order_id: "o", key_id: "k", amount: 1, currency: "INR", payment_id: "p", mode: "mock" }, error: null });
        if (fn === "verify-plan-upgrade-payment") return Promise.resolve({ data: { ok: true, plan_tier: "premium", seats_clamped: true }, error: null });
        return Promise.resolve({ data: { razorpay_order_id: "o", razorpay_payment_id: "pm", razorpay_signature: "s" }, error: null });
      });
      open();
      fireEvent.click(screen.getByRole("button", { name: /pay .* upgrade/i }));
      await waitFor(() => expect(screen.getByText(/mock payment gateway/i)).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: /payment successful/i }));
      await waitFor(() => expect(toastWarning).toHaveBeenCalledWith(expect.stringMatching(/some seats couldn't be added/i), expect.anything()));
      vi.unstubAllGlobals();
    });
  });

  describe("extra doctors row", () => {
    const open = () => {
      render(<UpgradeCheckoutDialog targetTier="premium" trigger={<button>Request Upgrade</button>} />);
      fireEvent.click(screen.getByRole("button", { name: "Request Upgrade" }));
    };
    const access = (over: Record<string, unknown> = {}) => ({ seat_price: 500, seat_max: 6, purchased_seats: 0, ...over });

    it("is absent for a single-doctor clinic, even with a price set", () => {
      practState.value = { active: [{}], access: access() };
      open();
      expect(screen.queryByText(/extra doctors/i)).not.toBeInTheDocument();
    });

    it("is absent while the seat price is unset", () => {
      practState.value = { active: [{}, {}], access: access({ seat_price: null }) };
      open();
      expect(screen.queryByText(/extra doctors/i)).not.toBeInTheDocument();
    });

    it("is absent for a Pro target", () => {
      practState.value = { active: [{}, {}], access: access() };
      render(<UpgradeCheckoutDialog targetTier="pro" trigger={<button>Go Pro</button>} />);
      fireEvent.click(screen.getByRole("button", { name: "Go Pro" }));
      expect(screen.queryByText(/extra doctors/i)).not.toBeInTheDocument();
    });

    it("shows for a 2+ doctor clinic, defaults to purchased seats, shows the combined total and sends seats", async () => {
      practState.value = { active: [{}, {}], access: access({ purchased_seats: 2 }) };
      invokeMock.mockResolvedValue({ data: null, error: new Error("stop") });
      open();
      expect(screen.getByText(/extra doctors/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /pay .*4999.* upgrade/i })).toBeInTheDocument(); // 3999 + 2 x 500
      fireEvent.click(screen.getByRole("button", { name: /more extra doctors/i }));
      expect(screen.getByRole("button", { name: /pay .*5499.* upgrade/i })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /pay .* upgrade/i }));
      await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("create-plan-upgrade-order", { body: { target_tier: "premium", seats: 3 } }));
    });

    it("shows when purchased seats are active even with one active doctor, and omits seats at 0", async () => {
      practState.value = { active: [{}], access: access({ purchased_seats: 1 }) };
      invokeMock.mockResolvedValue({ data: null, error: new Error("stop") });
      open();
      fireEvent.click(screen.getByRole("button", { name: /fewer extra doctors/i }));
      fireEvent.click(screen.getByRole("button", { name: /pay .* upgrade/i }));
      await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("create-plan-upgrade-order", { body: { target_tier: "premium" } }));
    });
  });
});
