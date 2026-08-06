import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PhoneOtpForm from "./PhoneOtpForm";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithOtp: vi.fn(),
      verifyOtp: vi.fn(),
    },
  },
}));

vi.mock("./useTurnstile", () => ({
  useTurnstile: () => ({
    containerRef: { current: null },
    token: "mock-turnstile-token",
    reset: vi.fn(),
    siteKeyMissing: false,
  }),
}));

import { supabase } from "@/integrations/supabase/client";

describe("PhoneOtpForm - phone entry step", () => {
  const onAuthenticated = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a validation error and does not call the API for an invalid phone number", async () => {
    render(<PhoneOtpForm mode="signup" onAuthenticated={onAuthenticated} />);
    fireEvent.change(screen.getByLabelText(/phone number/i), { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: /send otp/i }));

    expect(await screen.findByText(/enter a valid phone number/i)).toBeInTheDocument();
    expect(supabase.auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("calls signInWithOtp with shouldCreateUser true and the captcha token on signup", async () => {
    (supabase.auth.signInWithOtp as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {}, error: null });
    render(<PhoneOtpForm mode="signup" onAuthenticated={onAuthenticated} />);

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Dr. Rahul Sharma" } });
    fireEvent.change(screen.getByLabelText(/phone number/i), { target: { value: "+919876543210" } });
    fireEvent.click(screen.getByRole("button", { name: /send otp/i }));

    await waitFor(() =>
      expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
        phone: "+919876543210",
        options: {
          shouldCreateUser: true,
          captchaToken: "mock-turnstile-token",
          data: { full_name: "Dr. Rahul Sharma" },
        },
      })
    );
    expect(await screen.findByLabelText(/6-digit code/i)).toBeInTheDocument();
  });

  it("calls signInWithOtp with shouldCreateUser false on login, and shows a sign-up link on 'not found' errors", async () => {
    (supabase.auth.signInWithOtp as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {},
      error: { message: "Signups not allowed for otp" },
    });
    const onRequestSignup = vi.fn();
    render(<PhoneOtpForm mode="login" onAuthenticated={onAuthenticated} onRequestSignup={onRequestSignup} />);

    fireEvent.change(screen.getByLabelText(/phone number/i), { target: { value: "+919876543210" } });
    fireEvent.click(screen.getByRole("button", { name: /send otp/i }));

    await waitFor(() =>
      expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
        phone: "+919876543210",
        options: { shouldCreateUser: false, captchaToken: "mock-turnstile-token" },
      })
    );
    const link = await screen.findByRole("button", { name: /sign up instead/i });
    fireEvent.click(link);
    expect(onRequestSignup).toHaveBeenCalled();
  });
});
