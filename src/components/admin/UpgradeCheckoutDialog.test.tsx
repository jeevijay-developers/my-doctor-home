import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import UpgradeCheckoutDialog from "./UpgradeCheckoutDialog";

const { invokeMock, refetchMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  refetchMock: vi.fn(),
}));

vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({ profile: { plan_tier: "pro", plan_status: "active" }, loading: false, refetch: refetchMock }),
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
    refetchMock.mockReset();
  });

  it("opens on trigger click and shows the target tier's price and features", () => {
    render(<UpgradeCheckoutDialog targetTier="premium" trigger={<button>Request Upgrade</button>} />);
    fireEvent.click(screen.getByRole("button", { name: "Request Upgrade" }));
    expect(screen.getByText(/online consultation/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pay .*3999.* upgrade/i })).toBeInTheDocument();
  });

  it("creates an order and verifies a successful mock payment, then refetches the profile", async () => {
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

    await waitFor(() => expect(refetchMock).toHaveBeenCalled());
  });
});
