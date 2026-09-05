import { supabase } from "@/integrations/supabase/client";
import type { OtpService, SendOtpParams, SendOtpResult, VerifyOtpParams, VerifyOtpResult } from "./types";

export function normalizePhoneNumber(phone: string): string {
  const cleaned = phone.replace(/[\s-]/g, "");
  if (cleaned.startsWith("+")) {
    return cleaned;
  }
  // Default to +91 if country code missing and starts with 10 digit Indian number
  if (/^\d{10}$/.test(cleaned)) {
    return `+91${cleaned}`;
  }
  return cleaned;
}

export function parseRetryAfterSeconds(message: string): number | undefined {
  const match = message.match(/after (\d+) seconds?/i);
  return match ? parseInt(match[1], 10) : undefined;
}

export class ProductionOtpService implements OtpService {
  readonly isMock = false;

  async sendOtp(params: SendOtpParams): Promise<SendOtpResult> {
    const phone = normalizePhoneNumber(params.phone);
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options:
        params.mode === "signup"
          ? {
              shouldCreateUser: true,
              captchaToken: params.captchaToken,
              data: params.fullName ? { full_name: params.fullName } : undefined,
            }
          : {
              shouldCreateUser: false,
              captchaToken: params.captchaToken,
            },
    });

    if (error) {
      const retryAfterSeconds = parseRetryAfterSeconds(error.message);
      if (retryAfterSeconds !== undefined) {
        return {
          success: false,
          message: `Please wait ${retryAfterSeconds}s before requesting another code.`,
          retryAfterSeconds,
        };
      }
      if (params.mode === "login" && (error.message.includes("Signups not allowed") || error.message.includes("User not found"))) {
        return {
          success: false,
          message: "No account found with this phone number.",
          showSignupLink: true,
        };
      }
      return {
        success: false,
        message: error.message,
      };
    }

    return { success: true };
  }

  async verifyOtp(params: VerifyOtpParams): Promise<VerifyOtpResult> {
    const phone = normalizePhoneNumber(params.phone);
    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token: params.otp,
      type: "sms",
    });

    if (error || !data.session) {
      return {
        success: false,
        message: error?.message || "Incorrect or expired code. Try again.",
      };
    }

    return {
      success: true,
      session: data.session,
    };
  }
}
