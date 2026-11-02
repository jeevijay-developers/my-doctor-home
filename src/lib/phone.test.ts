import { describe, expect, it } from "vitest";
import { isValidIndianPhone, normalizeIndianPhone, phoneErrorMessage } from "./phone";

describe("normalizeIndianPhone", () => {
  it("returns empty string for empty/falsy input", () => {
    expect(normalizeIndianPhone("")).toBe("");
    expect(normalizeIndianPhone(null as unknown as string)).toBe("");
    expect(normalizeIndianPhone(undefined as unknown as string)).toBe("");
  });

  it("strips spaces, dashes, parentheses and plus", () => {
    expect(normalizeIndianPhone("98765 43210")).toBe("9876543210");
    expect(normalizeIndianPhone("98765-43210")).toBe("9876543210");
    expect(normalizeIndianPhone("(987) 654-3210")).toBe("9876543210");
  });

  it("strips a +91 / 91 country-code prefix only when 12 digits", () => {
    expect(normalizeIndianPhone("+91 98765 43210")).toBe("9876543210");
    expect(normalizeIndianPhone("919876543210")).toBe("9876543210");
    // 10-digit number that merely starts with 91 must be left alone
    expect(normalizeIndianPhone("9123456789")).toBe("9123456789");
  });

  it("strips a leading 0 trunk prefix only when 11 digits", () => {
    expect(normalizeIndianPhone("09876543210")).toBe("9876543210");
    expect(normalizeIndianPhone("0987654321")).toBe("0987654321");
  });

  it("leaves other lengths untouched", () => {
    expect(normalizeIndianPhone("12345")).toBe("12345");
    expect(normalizeIndianPhone("98765432101234")).toBe("98765432101234");
  });
});

describe("isValidIndianPhone", () => {
  it.each(["9876543210", "6000000000", "7999999999", "8123456789", "+919876543210", "09876543210", "98765-43210"])(
    "accepts %s",
    (n) => expect(isValidIndianPhone(n)).toBe(true),
  );

  it.each(["", "5876543210", "0876543210", "1234567890", "987654321", "98765432101", "abcdefghij", "+1 9876543210", "+91 5876543210"])(
    "rejects %j",
    (n) => expect(isValidIndianPhone(n)).toBe(false),
  );

  it("exposes a human message", () => {
    expect(phoneErrorMessage).toMatch(/10-digit/);
  });
});
