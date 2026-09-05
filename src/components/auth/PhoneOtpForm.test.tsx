import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import PhoneOtpForm from "./PhoneOtpForm";
import { otpService } from "@/lib/auth/otp/otpService";
import { MockOtpService } from "@/lib/auth/otp/mockOtpService";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithOtp: vi.fn(),
      verifyOtp: vi.fn(),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session: null }, error: new Error("Not found") }),
      signUp: vi.fn().mockResolvedValue({ data: { session: { user: { id: "dev-user" } } }, error: null }),
    },
  },
}));

describe("PhoneOtpForm - phone entry step", () => {
  const onAuthenticated = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    if (otpService instanceof MockOtpService) {
      otpService.clearChallenges();
    }
  });

  it("shows a validation error and does not send OTP for an invalid phone number", async () => {
    render(<PhoneOtpForm mode="signup" onAuthenticated={onAuthenticated} />);
    fireEvent.change(screen.getByLabelText(/phone number/i), { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: /send otp/i }));

    expect(await screen.findByText(/enter a valid phone number/i)).toBeInTheDocument();
  });

  it("sends OTP and moves to OTP step for a valid phone number", async () => {
    render(<PhoneOtpForm mode="signup" onAuthenticated={onAuthenticated} />);

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Dr. Rahul Sharma" } });
    fireEvent.change(screen.getByLabelText(/phone number/i), { target: { value: "+919876543210" } });
    fireEvent.click(screen.getByRole("button", { name: /send otp/i }));

    expect(await screen.findByLabelText(/6-digit code/i)).toBeInTheDocument();
  });
});

describe("PhoneOtpForm - OTP entry step", () => {
  const onAuthenticated = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    if (otpService instanceof MockOtpService) {
      otpService.clearChallenges();
    }
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function getToOtpStep(phoneNum = "+919876543210") {
    render(<PhoneOtpForm mode="login" onAuthenticated={onAuthenticated} />);
    fireEvent.change(screen.getByLabelText(/phone number/i), { target: { value: phoneNum } });
    fireEvent.click(screen.getByRole("button", { name: /send otp/i }));
    await screen.findByLabelText(/6-digit code/i);
  }

  it("verifies the code and calls onAuthenticated with returned session", async () => {
    const fakeSession = { user: { id: "user-1" } } as unknown as Session;
    vi.spyOn(otpService, "verifyOtp").mockResolvedValueOnce({
      success: true,
      session: fakeSession,
    });

    await getToOtpStep("+919876543211");

    fireEvent.change(screen.getByLabelText(/6-digit code/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /verify otp/i }));

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith(fakeSession));
  });

  it("shows an inline error for wrong OTP", async () => {
    vi.spyOn(otpService, "verifyOtp").mockResolvedValueOnce({
      success: false,
      message: "Incorrect or expired code. Try again.",
    });

    await getToOtpStep("+919876543212");

    fireEvent.change(screen.getByLabelText(/6-digit code/i), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: /verify otp/i }));

    expect(await screen.findByText(/incorrect or expired code/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/6-digit code/i)).toBeInTheDocument();
    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  it("allows changing phone number back to phone step", async () => {
    await getToOtpStep("+919876543213");

    const changePhoneBtn = screen.getByRole("button", { name: /change phone number/i });
    fireEvent.click(changePhoneBtn);

    expect(await screen.findByLabelText(/phone number/i)).toBeInTheDocument();
  });
});
