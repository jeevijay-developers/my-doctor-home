import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import ProtectedRoute from "./ProtectedRoute";

const { onAuthStateChangeMock, getSessionMock, fromMock } = vi.hoisted(() => ({
  onAuthStateChangeMock: vi.fn(),
  getSessionMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: onAuthStateChangeMock,
      getSession: getSessionMock,
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "doctor-123" } } }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: fromMock,
    rpc: vi.fn(),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: { mode: "mock" } }),
    },
  },
}));

describe("ProtectedRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows reactivation options for a cancelled admin account so they can upgrade and regain access", async () => {
    const session = { user: { id: "doctor-123" } };
    onAuthStateChangeMock.mockImplementation((cb) => {
      cb("SIGNED_IN", session);
      return {
        data: { subscription: { unsubscribe: vi.fn() } },
      };
    });
    getSessionMock.mockResolvedValue({ data: { session } });
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { plan_status: "cancelled", trial_end: null },
          }),
        }),
      }),
    });

    render(
      <ProtectedRoute>
        <div>Dashboard content</div>
      </ProtectedRoute>
    );

    await waitFor(() => {
      expect(screen.getByText(/Account suspended/i)).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /Reactivate Pro/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reactivate Premium/i })).toBeInTheDocument();
  });
});
