import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MockOtpService, MOCK_OTP_CODE } from "./mockOtpService";
import { ProductionOtpService, normalizePhoneNumber } from "./productionOtpService";

const { fakeSession } = vi.hoisted(() => ({
  fakeSession: { access_token: "at", refresh_token: "rt", user: { id: "dev-user-id" } },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: { session: fakeSession }, error: null }),
    },
    auth: {
      signInWithOtp: vi.fn(),
      verifyOtp: vi.fn(),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      setSession: vi.fn().mockResolvedValue({ data: { session: fakeSession }, error: null }),
      signUp: vi.fn().mockResolvedValue({ data: { session: { user: { id: "dev-user-id" } } }, error: null }),
    },
  },
}));

describe("normalizePhoneNumber", () => {
  it("preserves formatted numbers starting with +", () => {
    expect(normalizePhoneNumber("+91 97524-30783")).toBe("+919752430783");
  });

  it("appends +91 to 10-digit Indian numbers", () => {
    expect(normalizePhoneNumber("9752430783")).toBe("+919752430783");
  });
});

describe("MockOtpService", () => {
  let mockService: MockOtpService;

  beforeEach(() => {
    vi.useFakeTimers();
    mockService = new MockOtpService();
    mockService.clearChallenges();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends OTP for valid phone number and returns success", async () => {
    const res = await mockService.sendOtp({ phone: "+919752430783", mode: "login" });
    expect(res.success).toBe(true);
  });

  it("rejects invalid phone numbers", async () => {
    const res = await mockService.sendOtp({ phone: "123", mode: "login" });
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/valid phone number/i);
  });

  it("enforces 30-second resend cooldown", async () => {
    await mockService.sendOtp({ phone: "+919752430783", mode: "login" });

    // Immediate resend should fail
    const res1 = await mockService.sendOtp({ phone: "+919752430783", mode: "login" });
    expect(res1.success).toBe(false);
    expect(res1.message).toMatch(/wait \d+s/i);

    // Advance 31 seconds
    vi.advanceTimersByTime(31_000);

    const res2 = await mockService.sendOtp({ phone: "+919752430783", mode: "login" });
    expect(res2.success).toBe(true);
  });

  it("verifies test code 123456 successfully", async () => {
    await mockService.sendOtp({ phone: "+919752430783", mode: "login" });

    const res = await mockService.verifyOtp({ phone: "+919752430783", otp: MOCK_OTP_CODE, mode: "login" });
    expect(res.success).toBe(true);
  });

  it("rejects wrong OTP code and tracks remaining attempts", async () => {
    await mockService.sendOtp({ phone: "+919752430783", mode: "login" });

    const res = await mockService.verifyOtp({ phone: "+919752430783", otp: "000000", mode: "login" });
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/incorrect code/i);
    expect(res.attemptsRemaining).toBe(4);
  });

  it("locks OTP after 5 failed attempts", async () => {
    await mockService.sendOtp({ phone: "+919752430783", mode: "login" });

    for (let i = 0; i < 5; i++) {
      await mockService.verifyOtp({ phone: "+919752430783", otp: "000000", mode: "login" });
    }

    // 6th attempt should lock
    const res = await mockService.verifyOtp({ phone: "+919752430783", otp: "000000", mode: "login" });
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/too many failed attempts/i);
  });

  it("expires OTP after 5 minutes", async () => {
    await mockService.sendOtp({ phone: "+919752430783", mode: "login" });

    // Advance 5 minutes + 1 second
    vi.advanceTimersByTime(5 * 60 * 1000 + 1000);

    const res = await mockService.verifyOtp({ phone: "+919752430783", otp: MOCK_OTP_CODE, mode: "login" });
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/expired/i);
  });
});
