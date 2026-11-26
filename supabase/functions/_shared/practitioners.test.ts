import { describe, expect, it } from "vitest";
import { phoneOwnsClinic, pickBookingPractitioner, staffMayEditStaffRow, type PractitionerRow } from "./practitioners.ts";

describe("staffMayEditStaffRow", () => {
  it("lets the clinic owner edit any row, including doctor logins", () => {
    expect(staffMayEditStaffRow(true, { role: "doctor", practitioner_id: "p1" })).toBe(true);
    expect(staffMayEditStaffRow(true, { role: "staff", practitioner_id: null })).toBe(true);
  });
  it("blocks staff from doctor-role or practitioner-linked rows", () => {
    expect(staffMayEditStaffRow(false, { role: "doctor", practitioner_id: null })).toBe(false);
    expect(staffMayEditStaffRow(false, { role: "staff", practitioner_id: "p1" })).toBe(false);
    expect(staffMayEditStaffRow(false, { role: "doctor", practitioner_id: "p1" })).toBe(false);
  });
  it("lets staff edit a plain staff row", () => {
    expect(staffMayEditStaffRow(false, { role: "staff", practitioner_id: null })).toBe(true);
    expect(staffMayEditStaffRow(false, {})).toBe(true);
  });
});

const row = (id: string, over: Partial<PractitionerRow> = {}): PractitionerRow => ({
  id,
  is_primary: false,
  online_booking: true,
  consultation_fee: 600,
  sort_order: 0,
  created_at: "2026-11-01T00:00:00Z",
  ...over,
});

describe("pickBookingPractitioner", () => {
  it("picks the only doctor within seats when none is requested", () => {
    expect(pickBookingPractitioner([row("a", { is_primary: true })], 1)).toEqual({ ok: true, id: "a", fee: 600 });
  });

  it("requires a choice when two doctors are within seats", () => {
    expect(pickBookingPractitioner([row("a"), row("b")], 2)).toEqual({
      ok: false, error: "PRACTITIONER_REQUIRED", status: 409,
    });
  });

  it("refuses a requested doctor outside the seats", () => {
    expect(pickBookingPractitioner([row("a"), row("b")], 1, "b")).toEqual({
      ok: false, error: "PRACTITIONER_NOT_BOOKABLE", status: 409,
    });
  });

  it("refuses an unknown requested doctor", () => {
    expect(pickBookingPractitioner([row("a")], 1, "zzz")).toMatchObject({ ok: false, error: "PRACTITIONER_NOT_BOOKABLE" });
  });

  it("refuses a doctor who does not take online bookings", () => {
    expect(pickBookingPractitioner([row("a", { online_booking: false })], 1)).toEqual({
      ok: false, error: "PRACTITIONER_NOT_BOOKABLE", status: 409,
    });
    expect(pickBookingPractitioner([row("a"), row("b", { online_booking: false })], 2, "b")).toMatchObject({
      ok: false, error: "PRACTITIONER_NOT_BOOKABLE",
    });
  });

  it("auto-picks the only online-capable doctor when none is requested", () => {
    expect(pickBookingPractitioner([row("a", { online_booking: false }), row("b")], 2)).toEqual({ ok: true, id: "b", fee: 600 });
  });

  it("requires a choice when several doctors take online bookings", () => {
    expect(pickBookingPractitioner([row("a"), row("b"), row("c", { online_booking: false })], 3)).toEqual({
      ok: false, error: "PRACTITIONER_REQUIRED", status: 409,
    });
  });

  it("answers NOT_BOOKABLE when no doctor within seats takes online bookings", () => {
    expect(pickBookingPractitioner([row("a", { online_booking: false }), row("b", { online_booking: false })], 2)).toEqual({
      ok: false, error: "PRACTITIONER_NOT_BOOKABLE", status: 409,
    });
  });

  it("returns fee null for a zero or missing fee", () => {
    expect(pickBookingPractitioner([row("a", { consultation_fee: 0 })], 1)).toEqual({ ok: true, id: "a", fee: null });
    expect(pickBookingPractitioner([row("a", { consultation_fee: null })], 1)).toEqual({ ok: true, id: "a", fee: null });
  });

  it("falls back to the first row when seats drop to 1 (downgrade)", () => {
    expect(pickBookingPractitioner([row("a", { is_primary: true }), row("b")], 1)).toEqual({ ok: true, id: "a", fee: 600 });
  });

  it("treats a seat limit below 1 as 1", () => {
    expect(pickBookingPractitioner([row("a"), row("b")], 0)).toEqual({ ok: true, id: "a", fee: 600 });
  });

  it("accepts a requested doctor within seats and returns their fee", () => {
    expect(pickBookingPractitioner([row("a"), row("b", { consultation_fee: 900 })], 2, "b")).toEqual({
      ok: true, id: "b", fee: 900,
    });
  });

  it("refuses when the clinic has no bookable doctor", () => {
    expect(pickBookingPractitioner([], 1)).toMatchObject({ ok: false, error: "PRACTITIONER_REQUIRED" });
  });
});

describe("phoneOwnsClinic", () => {
  it("matches a clinic owner's phone on the last 10 digits, whatever the stored format", () => {
    expect(phoneOwnsClinic("919876543210", [{ phone: "+919876543210" }])).toBe(true);
    expect(phoneOwnsClinic("+919876543210", [{ phone: "9876543210" }])).toBe(true);
    expect(phoneOwnsClinic("9876543210", [{ phone: "+91 98765-43210" }])).toBe(true);
  });

  it("does not match a different number that merely contains the digits", () => {
    expect(phoneOwnsClinic("919876543210", [{ phone: "+9198765432101" }])).toBe(false);
    expect(phoneOwnsClinic("919876543210", [{ phone: "+919876543211" }])).toBe(false);
  });

  it("ignores rows without a phone and returns false for no rows", () => {
    expect(phoneOwnsClinic("919876543210", [{ phone: null }, { phone: "" }])).toBe(false);
    expect(phoneOwnsClinic("919876543210", [])).toBe(false);
  });

  it("never matches when the input has fewer than 10 digits", () => {
    expect(phoneOwnsClinic("12345", [{ phone: "12345" }])).toBe(false);
    expect(phoneOwnsClinic("", [{ phone: "" }])).toBe(false);
  });

  it("finds the owner among several rows", () => {
    expect(phoneOwnsClinic("919876543210", [{ phone: "+919800000000" }, { phone: "+919876543210" }])).toBe(true);
  });
});
