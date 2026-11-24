import { describe, expect, it } from "vitest";
import { paymentSummary, queueWaitMinutes, slotTimeLabel } from "./manageAppointment";

describe("paymentSummary", () => {
  it("names how the visit was paid", () => {
    expect(paymentSummary({ payment_status: "paid", gateway_payment_id: "pay_1", amount: 500 })).toEqual({ label: "Paid online · ₹500", tone: "good" });
    expect(paymentSummary({ payment_status: "paid", payment_method: "upi", amount: 300 })?.label).toBe("Paid at the clinic (UPI) · ₹300");
    expect(paymentSummary({ payment_status: "pay_at_clinic", amount: 0 })?.label).toBe("Pay at the clinic");
    expect(paymentSummary({ payment_status: "pending", amount: 200 })?.tone).toBe("warn");
  });
  it("guesses nothing when the server did not say", () => {
    expect(paymentSummary({ amount: 500 })).toBeNull();
  });
});

describe("slotTimeLabel", () => {
  it("formats 24-hour slots for people", () => {
    expect(slotTimeLabel("14:30:00")).toBe("2:30 PM");
    expect(slotTimeLabel("00:15")).toBe("12:15 AM");
    expect(slotTimeLabel(null)).toBe("");
  });
});

describe("queueWaitMinutes", () => {
  it("estimates from the people ahead and the clinic's average", () => {
    expect(queueWaitMinutes({ ahead: 2, now_serving: 5, avg_minutes: 10 })).toBe(25);
    expect(queueWaitMinutes({ ahead: 0, now_serving: null, avg_minutes: 8 })).toBe(1);
    expect(queueWaitMinutes({ ahead: 2, avg_minutes: null })).toBeNull();
  });
});
