import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import RequestUpgradeDialog from "./RequestUpgradeDialog";

const insertMock = vi.fn().mockResolvedValue({ error: null });

vi.mock("@/hooks/useProfile", () => ({
  useProfile: () => ({ profile: { plan_tier: "pro", plan_status: "active" }, loading: false }),
}));
vi.mock("@/hooks/usePlanAccess", () => ({
  usePlanAccess: () => ({ isPremium: false, appointmentsCap: 100, appointmentsUsed: 0, nearCap: false, loading: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "doctor-1" } } }) },
    from: vi.fn(() => ({ insert: insertMock })),
  },
}));

describe("RequestUpgradeDialog", () => {
  beforeEach(() => insertMock.mockClear());

  it("opens on trigger click and shows the target tier's features", () => {
    render(<RequestUpgradeDialog targetTier="premium" trigger={<button>Request Upgrade</button>} />);
    fireEvent.click(screen.getByRole("button", { name: "Request Upgrade" }));
    expect(screen.getByText(/online consultation/i)).toBeInTheDocument();
    expect(screen.getByText(/billing & invoices/i)).toBeInTheDocument();
  });

  it("submits an upgrade-request ticket with structured metadata for an active Pro doctor", async () => {
    render(<RequestUpgradeDialog targetTier="premium" trigger={<button>Request Upgrade</button>} />);
    fireEvent.click(screen.getByRole("button", { name: "Request Upgrade" }));
    fireEvent.click(screen.getByRole("button", { name: /send request/i }));

    await waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));
    const payload = insertMock.mock.calls[0][0];
    expect(payload.subject).toBe("Upgrade request: Pro → Premium");
    expect(payload.priority).toBe("normal");
    expect(payload.metadata).toEqual({
      upgrade_request: { from_tier: "pro", from_status: "active", to_tier: "premium" },
    });
  });
});
