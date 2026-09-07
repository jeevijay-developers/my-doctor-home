import type { OtpService } from "./types";
import { MockOtpService } from "./mockOtpService";
import { ProductionOtpService } from "./productionOtpService";

// Gated only on VITE_ENABLE_TEST_OTP (not import.meta.env.DEV) so this can be
// switched on for a production build too, e.g. while a real SMS provider
// isn't configured yet. Whoever sets this true in a deployed build's env
// must remember to unset it and redeploy once real testing is done — it's a
// public, unauthenticated login bypass (OTP is always "123456") for as long
// as it stays on.
export function isMockOtpEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_TEST_OTP === "true";
}

export function getOtpService(): OtpService {
  if (isMockOtpEnabled()) {
    return new MockOtpService();
  }
  return new ProductionOtpService();
}

export const otpService: OtpService = getOtpService();

export * from "./types";
export { normalizePhoneNumber } from "./productionOtpService";
export { MOCK_OTP_CODE } from "./mockOtpService";
