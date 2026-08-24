import { describe, expect, it } from "vitest";
import { effectiveAppointmentCapacity } from "./appointmentCapacity";

describe("effectiveAppointmentCapacity", () => {
  it("uses the configured clinic capacity for clinic visits", () => {
    expect(effectiveAppointmentCapacity("clinic", 5)).toBe(5);
  });

  it("keeps online consultations exclusive regardless of clinic capacity", () => {
    expect(effectiveAppointmentCapacity("online", 5)).toBe(1);
  });

  it("falls back to one for missing or invalid clinic capacity", () => {
    expect(effectiveAppointmentCapacity("clinic", undefined)).toBe(1);
    expect(effectiveAppointmentCapacity("clinic", 0)).toBe(1);
    expect(effectiveAppointmentCapacity("clinic", -2)).toBe(1);
  });
});