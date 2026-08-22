import { describe, expect, it } from "vitest";
import { appointmentSerialNumber } from "./appointmentList";

describe("appointmentSerialNumber", () => {
  it("continues numbering across pages", () => {
    expect(appointmentSerialNumber(0, 1, 10)).toBe(1);
    expect(appointmentSerialNumber(0, 2, 10)).toBe(11);
    expect(appointmentSerialNumber(4, 3, 10)).toBe(25);
  });
});