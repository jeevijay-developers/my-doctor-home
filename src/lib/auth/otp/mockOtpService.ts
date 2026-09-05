import { supabase } from "@/integrations/supabase/client";
import type { OtpService, SendOtpParams, SendOtpResult, VerifyOtpParams, VerifyOtpResult } from "./types";
import { normalizePhoneNumber } from "./productionOtpService";

export interface MockOtpChallenge {
  phone: string;
  otp: string;
  createdAt: number;
  expiresAt: number;
  attempts: number;
  lastSentAt: number;
}

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const RESEND_COOLDOWN_MS = 30 * 1000; // 30 seconds
const MAX_ATTEMPTS = 5;
export const MOCK_OTP_CODE = "123456";

// In-memory store for dev mock challenges
const challengeStore = new Map<string, MockOtpChallenge>();

// supabase.functions.invoke() only gives an Error on non-2xx responses — the
// JSON body (where mock-otp-login puts { error, showSignupLink }) has to be
// read off the underlying Response via FunctionsHttpError.context.
async function readEdgeFunctionErrorBody(error: unknown): Promise<{ error?: string; message?: string; showSignupLink?: boolean } | null> {
  try {
    const err = error as { context?: Response };
    if (err?.context && typeof err.context.json === "function") {
      return await err.context.json();
    }
  } catch {
    // fall through
  }
  return null;
}

export class MockOtpService implements OtpService {
  readonly isMock = true;

  async sendOtp(params: SendOtpParams): Promise<SendOtpResult> {
    const phone = normalizePhoneNumber(params.phone);
    if (!/^\+?[1-9]\d{7,14}$/.test(phone)) {
      return {
        success: false,
        message: "Enter a valid phone number, e.g. +919876543210",
      };
    }

    const now = Date.now();
    const existing = challengeStore.get(phone);

    if (existing && now - existing.lastSentAt < RESEND_COOLDOWN_MS) {
      const remainingSec = Math.ceil((RESEND_COOLDOWN_MS - (now - existing.lastSentAt)) / 1000);
      return {
        success: false,
        message: `Please wait ${remainingSec}s before requesting another code.`,
        retryAfterSeconds: remainingSec,
      };
    }

    // Invalidate any previous challenge and store fresh challenge
    challengeStore.set(phone, {
      phone,
      otp: MOCK_OTP_CODE,
      createdAt: now,
      expiresAt: now + OTP_TTL_MS,
      attempts: 0,
      lastSentAt: now,
    });

    return { success: true };
  }

  async verifyOtp(params: VerifyOtpParams): Promise<VerifyOtpResult> {
    const phone = normalizePhoneNumber(params.phone);
    const challenge = challengeStore.get(phone);
    const now = Date.now();

    if (!challenge || now > challenge.expiresAt) {
      challengeStore.delete(phone);
      return {
        success: false,
        message: "OTP expired or not found. Please request a new code.",
      };
    }

    challenge.attempts += 1;

    if (challenge.attempts > MAX_ATTEMPTS) {
      challengeStore.delete(phone);
      return {
        success: false,
        message: "Too many failed attempts. This OTP has been locked. Please request a new code.",
        attemptsRemaining: 0,
      };
    }

    if (params.otp !== challenge.otp) {
      const attemptsRemaining = Math.max(0, MAX_ATTEMPTS - challenge.attempts);
      return {
        success: false,
        message: `Incorrect code. Try again. (${attemptsRemaining} attempts left)`,
        attemptsRemaining,
      };
    }

    // Retrieve or create active Supabase session
    const { data: sessionData } = await supabase.auth.getSession();
    let session = sessionData.session;
    let authErrorMessage: string | null = null;
    let authShowSignupLink = false;

    if (!session) {
      const fullName = params.mode === "signup" ? "Dev Doctor" : "Test User";
      const isSignup = params.mode === "signup";
      try {
        // Minted server-side (service role) so it never touches the public
        // password-grant + CAPTCHA endpoint — see mock-otp-login for why.
        const { data, error: fnError } = await supabase.functions.invoke("mock-otp-login", {
          body: { phone, otp: params.otp, fullName, isSignup },
        });

        if (fnError) {
          console.error("mock-otp-login error:", fnError);
          const errorBody = await readEdgeFunctionErrorBody(fnError);
          authErrorMessage = errorBody?.error || errorBody?.message || "Authentication error";
          authShowSignupLink = !!errorBody?.showSignupLink;
        } else if (data?.session) {
          const { data: setSessionData, error: setSessionError } = await supabase.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          });
          if (setSessionError) {
            console.error("setSession error:", setSessionError);
            authErrorMessage = setSessionError.message;
          }
          session = setSessionData?.session || null;
        }
      } catch (err) {
        console.error("Error creating dev user session:", err);
      }
    }

    if (!session) {
      return {
        success: false,
        message: authErrorMessage || "Failed to establish development session. Please try again.",
        showSignupLink: authShowSignupLink || undefined,
      };
    }

    // Verification & session creation successful -> Invalidate challenge
    challengeStore.delete(phone);

    return {
      success: true,
      session,
    };
  }

  // Clear challenge store (useful for testing)
  clearChallenges(): void {
    challengeStore.clear();
  }
}
