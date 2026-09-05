import type { Session } from "@supabase/supabase-js";

export interface SendOtpParams {
  phone: string;
  mode: "login" | "signup";
  fullName?: string;
  captchaToken?: string;
}

export interface SendOtpResult {
  success: boolean;
  message?: string;
  retryAfterSeconds?: number;
  showSignupLink?: boolean;
}

export interface VerifyOtpParams {
  phone: string;
  otp: string;
  mode: "login" | "signup";
  captchaToken?: string;
}

export interface VerifyOtpResult {
  success: boolean;
  session?: Session;
  message?: string;
  attemptsRemaining?: number;
  showSignupLink?: boolean;
}

export interface OtpService {
  isMock: boolean;
  sendOtp(params: SendOtpParams): Promise<SendOtpResult>;
  verifyOtp(params: VerifyOtpParams): Promise<VerifyOtpResult>;
}
