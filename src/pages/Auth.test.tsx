import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Auth from "./Auth";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      signOut: vi.fn().mockResolvedValue({}),
    },
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

vi.mock("@/components/auth/PhoneOtpForm", () => ({
  default: ({ mode, onAuthenticated }: { mode: string; onAuthenticated: (s: unknown) => void }) => (
    <div data-testid="phone-otp-form">
      phone form ({mode})
      <button onClick={() => onAuthenticated({ user: { id: "user-1" } })}>finish login</button>
    </div>
  ),
}));

function renderAuth(initialEntry = "/auth?mode=signup") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Auth />
    </MemoryRouter>
  );
}

describe("Auth page - phone OTP only", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders only the phone OTP form for signup", async () => {
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("phone-otp-form")).toHaveTextContent("phone form (signup)"));

    expect(screen.queryByLabelText(/^email$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^password$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /google/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^email$/i })).not.toBeInTheDocument();
  });

  it("renders the phone OTP form in login mode without a Forgot Password link", async () => {
    renderAuth("/auth?mode=login");
    await waitFor(() => expect(screen.getByTestId("phone-otp-form")).toHaveTextContent("phone form (login)"));

    expect(screen.queryByRole("button", { name: /forgot password/i })).not.toBeInTheDocument();
  });

  it("switches between login and signup", async () => {
    renderAuth("/auth?mode=login");
    await waitFor(() => expect(screen.getByTestId("phone-otp-form")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /sign up free/i }));
    expect(screen.getByTestId("phone-otp-form")).toHaveTextContent("phone form (signup)");

    fireEvent.click(screen.getByRole("button", { name: /^log in$/i }));
    expect(screen.getByTestId("phone-otp-form")).toHaveTextContent("phone form (login)");
  });

  describe("after OTP verification", () => {
    const mockStaffRow = (row: { status: string } | null) => {
      vi.mocked(supabase.rpc).mockResolvedValue({ data: false, error: null } as never);
      vi.mocked(supabase.from).mockReturnValue({
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row }) }) }),
      } as never);
    };

    const loginAs = async () => {
      render(
        <MemoryRouter initialEntries={["/auth?mode=login"]}>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/admin/dashboard" element={<div>admin dashboard</div>} />
            <Route path="/onboarding" element={<div>onboarding</div>} />
          </Routes>
        </MemoryRouter>
      );
      fireEvent.click(await screen.findByRole("button", { name: /finish login/i }));
    };

    it("sends an active staff member straight to the admin dashboard", async () => {
      mockStaffRow({ status: "active" });
      await loginAs();
      expect(await screen.findByText("admin dashboard")).toBeInTheDocument();
      expect(supabase.rpc).toHaveBeenCalledWith("touch_staff_login");
    });

    it("signs out an inactive staff member instead of entering the panel", async () => {
      mockStaffRow({ status: "inactive" });
      await loginAs();
      await waitFor(() => expect(supabase.auth.signOut).toHaveBeenCalled());
      expect(screen.queryByText("admin dashboard")).not.toBeInTheDocument();
    });
  });
});
