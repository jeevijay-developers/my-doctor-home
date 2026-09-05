import type { OtpService } from "./types";
import { MockOtpService } from "./mockOtpService";
import { ProductionOtpService } from "./productionOtpService";

export function isMockOtpEnabled(): boolean {
  return (
    import.meta.env.DEV === true &&
    import.meta.env.VITE_ENABLE_TEST_OTP === "true"
  );
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
