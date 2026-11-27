import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fakeSession, h } = vi.hoisted(() => ({
  fakeSession: { access_token: "at", refresh_token: "rt", user: { id: "u1" } },
  h: {
    existingSession: null as any,
    invoke: vi.fn(),
    signInWithOtp: vi.fn(),
    verifyOtp: vi.fn(),
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => h.invoke(...a) },
    auth: {
      signInWithOtp: (...a: unknown[]) => h.signInWithOtp(...a),
      verifyOtp: (...a: unknown[]) => h.verifyOtp(...a),
      getSession: vi.fn(async () => ({ data: { session: h.existingSession } })),
      setSession: vi.fn(async () => ({ data: { session: fakeSession }, error: null })),
    },
  },
}));

import { MOCK_OTP_CODE, MockOtpService } from "./mockOtpService";
import { ProductionOtpService, normalizePhoneNumber, parseRetryAfterSeconds } from "./productionOtpService";

describe("normalizePhoneNumber edge cases", () => {
  it("handles empty and dash/space-only input", () => {
    expect(normalizePhoneNumber("")).toBe("");
    expect(normalizePhoneNumber(" - ")).toBe("");
  });
  it("does not prefix 9/11-digit numbers", () => {
    expect(normalizePhoneNumber("987654321")).toBe("987654321");
    expect(normalizePhoneNumber("09876543210")).toBe("09876543210");
  });
  it("does not strip parentheses or dots", () => {
    expect(normalizePhoneNumber("(98765)43210")).toBe("(98765)43210");
  });
});

describe("parseRetryAfterSeconds", () => {
  it("extracts seconds from the GoTrue rate-limit message", () => {
    expect(parseRetryAfterSeconds("For security purposes, you can only request this after 42 seconds.")).toBe(42);
    expect(parseRetryAfterSeconds("try again AFTER 1 second")).toBe(1);
  });
  it("returns undefined when absent", () => {
    expect(parseRetryAfterSeconds("")).toBeUndefined();
    expect(parseRetryAfterSeconds("Invalid phone")).toBeUndefined();
    expect(parseRetryAfterSeconds("after soon seconds")).toBeUndefined();
  });
});

describe("MockOtpService", () => {
  let svc: MockOtpService;
  let n = 0;
  const phone = () => `+9198${String(10000000 + ++n)}`;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T10:00:00Z"));
    h.existingSession = fakeSession;
    h.invoke.mockReset();
    svc = new MockOtpService();
    svc.clearChallenges();
  });
  afterEach(() => vi.useRealTimers());

  it("rejects malformed numbers", async () => {
    for (const bad of ["", "123", "+0123456789", "abc", "+91 98", "+" + "9".repeat(16)]) {
      const r = await svc.sendOtp({ phone: bad, mode: "login" });
      expect(r.success).toBe(false);
      expect(r.message).toMatch(/valid phone/i);
    }
  });

  it("accepts a bare 10-digit number (normalized to +91)", async () => {
    expect((await svc.sendOtp({ phone: "9876543210", mode: "login" })).success).toBe(true);
    expect((await svc.verifyOtp({ phone: "+919876543210", otp: MOCK_OTP_CODE, mode: "login" })).success).toBe(true);
  });

  it("enforces a 30s resend cooldown with a ceil'd retryAfterSeconds, then allows again", async () => {
    const p = phone();
    expect((await svc.sendOtp({ phone: p, mode: "login" })).success).toBe(true);
    vi.advanceTimersByTime(10_500);
    const r = await svc.sendOtp({ phone: p, mode: "login" });
    expect(r).toMatchObject({ success: false, retryAfterSeconds: 20 });
    vi.advanceTimersByTime(19_500);
    expect((await svc.sendOtp({ phone: p, mode: "login" })).success).toBe(true);
  });

  it("cooldown is per phone", async () => {
    await svc.sendOtp({ phone: phone(), mode: "login" });
    expect((await svc.sendOtp({ phone: phone(), mode: "login" })).success).toBe(true);
  });

  it("verify without send reports expired/not found", async () => {
    const r = await svc.verifyOtp({ phone: phone(), otp: MOCK_OTP_CODE, mode: "login" });
    expect(r).toMatchObject({ success: false, message: expect.stringMatching(/expired or not found/i) });
  });

  it("expires after 5 minutes", async () => {
    const p = phone();
    await svc.sendOtp({ phone: p, mode: "login" });
    vi.advanceTimersByTime(5 * 60 * 1000);
    expect((await svc.verifyOtp({ phone: p, otp: MOCK_OTP_CODE, mode: "login" })).success).toBe(true);

    const q = phone();
    await svc.sendOtp({ phone: q, mode: "login" });
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(await svc.verifyOtp({ phone: q, otp: MOCK_OTP_CODE, mode: "login" })).toMatchObject({
      success: false,
      message: expect.stringMatching(/expired/i),
    });
  });

  it("counts down attempts, still accepts the right code on the 5th try, locks on the 6th", async () => {
    const p = phone();
    await svc.sendOtp({ phone: p, mode: "login" });
    for (let i = 1; i <= 4; i++) {
      const r = await svc.verifyOtp({ phone: p, otp: "000000", mode: "login" });
      expect(r).toMatchObject({ success: false, attemptsRemaining: 5 - i });
    }
    expect((await svc.verifyOtp({ phone: p, otp: MOCK_OTP_CODE, mode: "login" })).success).toBe(true);

    const q = phone();
    await svc.sendOtp({ phone: q, mode: "login" });
    for (let i = 0; i < 5; i++) await svc.verifyOtp({ phone: q, otp: "000000", mode: "login" });
    const locked = await svc.verifyOtp({ phone: q, otp: MOCK_OTP_CODE, mode: "login" });
    expect(locked).toMatchObject({ success: false, attemptsRemaining: 0, message: expect.stringMatching(/too many/i) });
    // challenge is gone afterwards
    expect((await svc.verifyOtp({ phone: q, otp: MOCK_OTP_CODE, mode: "login" })).message).toMatch(/expired or not found/i);
  });

  it("a successful verify consumes the challenge (no replay)", async () => {
    const p = phone();
    await svc.sendOtp({ phone: p, mode: "login" });
    expect((await svc.verifyOtp({ phone: p, otp: MOCK_OTP_CODE, mode: "login" })).success).toBe(true);
    expect((await svc.verifyOtp({ phone: p, otp: MOCK_OTP_CODE, mode: "login" })).success).toBe(false);
  });

  it("without an existing session, mints one via mock-otp-login (signup vs login names)", async () => {
    h.existingSession = null;
    h.invoke.mockResolvedValue({ data: { session: { access_token: "a", refresh_token: "r" } }, error: null });
    const p = phone();
    await svc.sendOtp({ phone: p, mode: "signup" });
    const r = await svc.verifyOtp({ phone: p, otp: MOCK_OTP_CODE, mode: "signup" });
    expect(r).toMatchObject({ success: true, session: fakeSession });
    expect(h.invoke).toHaveBeenCalledWith("mock-otp-login", {
      body: { phone: p, otp: MOCK_OTP_CODE, fullName: "Dev Doctor", isSignup: true },
    });
    const q = phone();
    await svc.sendOtp({ phone: q, mode: "login" });
    await svc.verifyOtp({ phone: q, otp: MOCK_OTP_CODE, mode: "login" });
    expect(h.invoke).toHaveBeenLastCalledWith("mock-otp-login", expect.objectContaining({ body: expect.objectContaining({ fullName: "Test User", isSignup: false }) }));
  });

  it("surfaces the edge-function error body and showSignupLink, keeping the challenge for retry", async () => {
    h.existingSession = null;
    const ctx = { json: async () => ({ error: "No account", showSignupLink: true }) };
    h.invoke.mockResolvedValue({ data: null, error: { context: ctx } });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const p = phone();
    await svc.sendOtp({ phone: p, mode: "login" });
    const r = await svc.verifyOtp({ phone: p, otp: MOCK_OTP_CODE, mode: "login" });
    expect(r).toMatchObject({ success: false, message: "No account", showSignupLink: true });
    errSpy.mockRestore();
    // challenge not consumed, so a retry with a now-working backend succeeds
    h.invoke.mockResolvedValue({ data: { session: { access_token: "a", refresh_token: "r" } }, error: null });
    expect((await svc.verifyOtp({ phone: p, otp: MOCK_OTP_CODE, mode: "login" })).success).toBe(true);
  });

  it("falls back to a generic message when the function throws", async () => {
    h.existingSession = null;
    h.invoke.mockRejectedValue(new Error("network"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const p = phone();
    await svc.sendOtp({ phone: p, mode: "login" });
    const r = await svc.verifyOtp({ phone: p, otp: MOCK_OTP_CODE, mode: "login" });
    expect(r).toMatchObject({ success: false, message: expect.stringMatching(/failed to establish/i) });
    expect(r.showSignupLink).toBeUndefined();
    errSpy.mockRestore();
  });
});

describe("ProductionOtpService", () => {
  const svc = new ProductionOtpService();
  beforeEach(() => {
    h.signInWithOtp.mockReset();
    h.verifyOtp.mockReset();
  });

  it("login: never creates users, normalizes the phone", async () => {
    h.signInWithOtp.mockResolvedValue({ error: null });
    expect(await svc.sendOtp({ phone: "98765 43210", mode: "login", fullName: "ignored" })).toEqual({ success: true });
    expect(h.signInWithOtp).toHaveBeenCalledWith({ phone: "+919876543210", options: { shouldCreateUser: false } });
  });

  it("signup: creates user and passes full_name only when given", async () => {
    h.signInWithOtp.mockResolvedValue({ error: null });
    await svc.sendOtp({ phone: "9876543210", mode: "signup", fullName: "Dr A" });
    expect(h.signInWithOtp.mock.calls[0][0].options).toMatchObject({ shouldCreateUser: true, data: { full_name: "Dr A" } });
    await svc.sendOtp({ phone: "9876543210", mode: "signup" });
    expect(h.signInWithOtp.mock.calls[1][0].options.data).toBeUndefined();
  });

  it("maps rate-limit errors to retryAfterSeconds", async () => {
    h.signInWithOtp.mockResolvedValue({ error: { message: "request this after 17 seconds" } });
    expect(await svc.sendOtp({ phone: "9876543210", mode: "login" })).toEqual({
      success: false,
      message: "Please wait 17s before requesting another code.",
      retryAfterSeconds: 17,
    });
  });

  it("login + unknown user -> showSignupLink; signup mode does not", async () => {
    h.signInWithOtp.mockResolvedValue({ error: { message: "Signups not allowed for otp" } });
    expect(await svc.sendOtp({ phone: "9876543210", mode: "login" })).toMatchObject({ success: false, showSignupLink: true });
    h.signInWithOtp.mockResolvedValue({ error: { message: "User not found" } });
    expect(await svc.sendOtp({ phone: "9876543210", mode: "login" })).toMatchObject({ showSignupLink: true });
    const r = await svc.sendOtp({ phone: "9876543210", mode: "signup" });
    expect(r).toEqual({ success: false, message: "User not found" });
  });

  it("passes other provider errors through", async () => {
    h.signInWithOtp.mockResolvedValue({ error: { message: "SMS provider down" } });
    expect(await svc.sendOtp({ phone: "9876543210", mode: "login" })).toEqual({ success: false, message: "SMS provider down" });
  });

  it("verifyOtp: success returns the session, uses sms type and normalized phone", async () => {
    h.verifyOtp.mockResolvedValue({ data: { session: fakeSession }, error: null });
    expect(await svc.verifyOtp({ phone: "9876543210", otp: "111111", mode: "login" })).toEqual({ success: true, session: fakeSession });
    expect(h.verifyOtp).toHaveBeenCalledWith({ phone: "+919876543210", token: "111111", type: "sms" });
  });

  it("verifyOtp: error, or missing session, fail with a message", async () => {
    h.verifyOtp.mockResolvedValue({ data: { session: null }, error: { message: "Token has expired" } });
    expect(await svc.verifyOtp({ phone: "9876543210", otp: "1", mode: "login" })).toEqual({ success: false, message: "Token has expired" });
    h.verifyOtp.mockResolvedValue({ data: { session: null }, error: null });
    expect(await svc.verifyOtp({ phone: "9876543210", otp: "1", mode: "login" })).toEqual({
      success: false,
      message: "Incorrect or expired code. Try again.",
    });
  });
});
