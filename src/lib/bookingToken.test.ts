import { describe, expect, it } from "vitest";
import { generateBookingToken, normalizeBookingToken } from "./bookingToken";

describe("booking token", () => {
  it("is T plus 7 unambiguous characters", () => {
    expect(generateBookingToken()).toMatch(/^T[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{7}$/);
  });

  it("does not repeat across a large batch", () => {
    const seen = new Set(Array.from({ length: 5000 }, generateBookingToken));
    expect(seen.size).toBe(5000);
  });

  it("matches what a patient types, whatever the case or spacing", () => {
    expect(normalizeBookingToken("  tk7m2qx9 ")).toBe("TK7M2QX9");
  });
});
