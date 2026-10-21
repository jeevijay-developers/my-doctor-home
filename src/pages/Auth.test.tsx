import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Auth from "./Auth";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

vi.mock("@/components/auth/PhoneOtpForm", () => ({
  default: ({ mode }: { mode: string }) => <div data-testid="phone-otp-form">phone form ({mode})</div>,
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
});
