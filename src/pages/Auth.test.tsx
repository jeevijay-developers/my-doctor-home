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

vi.mock("@/components/auth/useTurnstile", () => ({
  useTurnstile: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

import { supabase } from "@/integrations/supabase/client";
import { useTurnstile } from "@/components/auth/useTurnstile";
import { toast } from "sonner";

function mockTurnstile(overrides: Partial<ReturnType<typeof useTurnstile>> = {}) {
  const reset = vi.fn();
  vi.mocked(useTurnstile).mockReturnValue({
    containerRef: { current: null },
    token: "mock-turnstile-token",
    reset,
    siteKeyMissing: false,
    ...overrides,
  });
  return reset;
}

function renderAuth(initialEntry = "/auth?mode=signup") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Auth />
    </MemoryRouter>
  );
}

describe("Auth page - method tabs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTurnstile();
  });

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

describe("Auth page - Turnstile CAPTCHA on the email/password form (regression)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks submission and does not call the API when the Turnstile challenge hasn't been completed", async () => {
    mockTurnstile({ token: null });
    renderAuth("/auth?mode=login");
    await waitFor(() => expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "doc@example.com" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /^log in$/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/verification challenge/i))
    );
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("passes captchaToken on login and resets the widget afterward", async () => {
    const reset = mockTurnstile();
    (supabase.auth.signInWithPassword as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: null },
      error: null,
    });
    renderAuth("/auth?mode=login");
    await waitFor(() => expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "doc@example.com" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /^log in$/i }));

    await waitFor(() =>
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: "doc@example.com",
        password: "password123",
        options: { captchaToken: "mock-turnstile-token" },
      })
    );
    expect(reset).toHaveBeenCalled();
  });

  it("passes captchaToken on signup and resets the widget afterward, preserving existing options", async () => {
    const reset = mockTurnstile();
    (supabase.auth.signUp as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: null },
      error: null,
    });
    renderAuth("/auth?mode=signup");
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Dr. Rahul Sharma" } });
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "doc@example.com" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /create free account/i }));

    await waitFor(() =>
      expect(supabase.auth.signUp).toHaveBeenCalledWith({
        email: "doc@example.com",
        password: "password123",
        options: {
          data: { full_name: "Dr. Rahul Sharma" },
          emailRedirectTo: window.location.origin,
          captchaToken: "mock-turnstile-token",
        },
      })
    );
    expect(reset).toHaveBeenCalled();
  });

  it("passes captchaToken on forgot-password and resets the widget afterward, preserving redirectTo", async () => {
    const reset = mockTurnstile();
    (supabase.auth.resetPasswordForEmail as ReturnType<typeof vi.fn>).mockResolvedValue({ error: null });
    renderAuth("/auth?mode=login");
    await waitFor(() => expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /forgot password/i }));
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "doc@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() =>
      expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith("doc@example.com", {
        redirectTo: `${window.location.origin}/reset-password`,
        captchaToken: "mock-turnstile-token",
      })
    );
    expect(reset).toHaveBeenCalled();
  });

  it("does not affect the Phone/OTP flow (PhoneOtpForm still renders independently when the Phone tab is selected)", async () => {
    mockTurnstile({ token: null }); // even with no email-form token, Phone tab must still work
    renderAuth("/auth?mode=signup");
    await waitFor(() => expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /^phone$/i }));

    expect(screen.getByTestId("phone-otp-form")).toBeInTheDocument();
  });
});
