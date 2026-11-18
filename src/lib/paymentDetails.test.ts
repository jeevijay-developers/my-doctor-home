import { describe, expect, it } from "vitest";
import {
  methodNeedsReference,
  normalizePaymentReference,
  paymentDbErrorMessage,
  paymentMethodLabel,
  paymentReferenceError,
  paymentReferenceToStore,
} from "./paymentDetails";

describe("paymentReferenceError", () => {
  it("needs no reference for cash", () => {
    expect(paymentReferenceError("cash", "")).toBeNull();
  });

  it("requires a 12-digit UTR for UPI", () => {
    expect(paymentReferenceError("upi", "")).toMatch(/12-digit UTR/);
    expect(paymentReferenceError("upi", "12345")).toMatch(/exactly 12 digits/);
    expect(paymentReferenceError("upi", "1234567890AB")).toMatch(/exactly 12 digits/);
    expect(paymentReferenceError("upi", "123456789012")).toBeNull();
    expect(paymentReferenceError("upi", "1234 5678 9012")).toBeNull();
  });

  it("requires an approval code or last 4 digits for card", () => {
    expect(paymentReferenceError("card", "")).toMatch(/approval code/);
    expect(paymentReferenceError("card", "123")).toMatch(/4 to 12/);
    expect(paymentReferenceError("card", "4242")).toBeNull();
    expect(paymentReferenceError("card", "a1b2c3")).toBeNull();
    expect(paymentReferenceError("card", "12-34")).toMatch(/4 to 12/);
  });
});

describe("helpers", () => {
  it("normalises whitespace and case", () => {
    expect(normalizePaymentReference(" a1 b2 ")).toBe("A1B2");
  });

  it("stores a reference only for UPI and card", () => {
    expect(paymentReferenceToStore("cash", "123456789012")).toBeNull();
    expect(paymentReferenceToStore("upi", "1234 5678 9012")).toBe("123456789012");
    expect(paymentReferenceToStore("card", "")).toBeNull();
    expect(methodNeedsReference("upi")).toBe(true);
    expect(methodNeedsReference("cash")).toBe(false);
  });

  it("labels methods and treats gateway payments as Online", () => {
    expect(paymentMethodLabel("upi")).toBe("UPI");
    expect(paymentMethodLabel("cash", "razorpay")).toBe("Online");
    expect(paymentMethodLabel(null)).toBe("Not recorded");
  });

  it("maps database errors to friendly messages", () => {
    expect(paymentDbErrorMessage({ message: "PAYMENT_REFERENCE_REQUIRED" })).toMatch(/UTR/);
    expect(
      paymentDbErrorMessage({ code: "23505", message: 'duplicate key value violates unique constraint "appointments_upi_reference_unique"' }),
    ).toMatch(/already recorded/);
    expect(paymentDbErrorMessage({ message: "something else" })).toBeNull();
  });
});
