import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Auth from "./Auth";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    },
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

vi.mock("@/components/auth/PhoneOtpForm", () => ({
  default: ({ mode }: { mode: string }) => <div data-testid="phone-otp-form">phone form ({mode})</div>,
}));

function renderAuth() {
  return render(
    <MemoryRouter initialEntries={["/auth?mode=signup"]}>
      <Auth />
    </MemoryRouter>
  );
}

describe("Auth page - method tabs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the email form by default and hides it when switching to Phone", async () => {
    renderAuth();
    await waitFor(() => expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /^phone$/i }));

    expect(screen.queryByLabelText(/^email$/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("phone-otp-form")).toHaveTextContent("phone form (signup)");
  });

  it("switching to Phone and back preserves the email form's value (no crash, no data loss)", async () => {
    renderAuth();
    await waitFor(() => expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "doc@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /^phone$/i }));
    expect(screen.getByTestId("phone-otp-form")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^email$/i }));

    expect(screen.getByLabelText(/^email$/i)).toHaveValue("doc@example.com");
  });

  it("does not render the method tabs in forgot-password mode", async () => {
    render(
      <MemoryRouter initialEntries={["/auth?mode=login"]}>
        <Auth />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /forgot password/i }));

    expect(screen.queryByRole("button", { name: /^phone$/i })).not.toBeInTheDocument();
  });
});
