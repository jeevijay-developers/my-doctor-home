import { describe, it, expect } from "vitest";
import { defaultAppointmentAmount } from "./appointmentAmount";

describe("defaultAppointmentAmount", () => {
  it("uses the doctor's default consultation fee", () => {
    expect(defaultAppointmentAmount(500)).toBe(500);
  });

  it("falls back to 0 when the fee is unset, blank, or zero", () => {
    expect(defaultAppointmentAmount(undefined)).toBe(0);
    expect(defaultAppointmentAmount(null)).toBe(0);
    expect(defaultAppointmentAmount(0)).toBe(0);
  });

  it("falls back to 0 for non-numeric values", () => {
    expect(defaultAppointmentAmount(Number.NaN)).toBe(0);
  });
});
