import { describe, it, expect } from "vitest";
import { practitionerErrorMessage, PRACTITIONER_ERROR_CODES } from "./errors";

describe("practitionerErrorMessage", () => {
  it("has a non-empty message for every code", () => {
    for (const code of PRACTITIONER_ERROR_CODES) expect(practitionerErrorMessage(code)).toMatch(/\w/);
  });
  it("finds a code inside a Postgres error message", () => {
    expect(practitionerErrorMessage('new row violates ... SEAT_LIMIT')).toBe(practitionerErrorMessage("SEAT_LIMIT"));
  });
  it("returns null for unrelated errors", () => {
    expect(practitionerErrorMessage("SLOT_FULL")).toBeNull();
  });
  it("does not mistake PRIMARY_PRACTITIONER_REQUIRED for PRACTITIONER_REQUIRED", () => {
    expect(practitionerErrorMessage("PRIMARY_PRACTITIONER_REQUIRED")).not.toBe(practitionerErrorMessage("PRACTITIONER_REQUIRED"));
    expect(practitionerErrorMessage("PRIMARY_PRACTITIONER_REQUIRED")).toMatch(/main doctor/);
  });
  it("has the new access / closed-visit messages", () => {
    expect(practitionerErrorMessage("DOCTOR_LOGIN_FORBIDDEN")).toBe("Doctor logins can't create or move bookings. Please ask reception.");
    expect(practitionerErrorMessage("APPOINTMENT_CLOSED")).toBe("Completed or closed visits can't be moved to another doctor.");
    expect(practitionerErrorMessage("NOT_ALLOWED")).toBe("You don't have access to this prescription.");
    expect(practitionerErrorMessage("FORBIDDEN")).toBe("You can only manage your own queue.");
    expect(practitionerErrorMessage("DOCTOR_UNAVAILABLE")).toBe("This doctor is no longer taking bookings.");
  });
  it("matches codes as whole words only", () => {
    expect(practitionerErrorMessage("ERROR: DOCTOR_LOGIN_FORBIDDEN raised")).toMatch(/Doctor logins/);
    expect(practitionerErrorMessage("UNFORBIDDEN")).toBeNull();
    expect(practitionerErrorMessage("SOME_FORBIDDEN_THING")).toBeNull();
    expect(practitionerErrorMessage("NOT_ALLOWED_X")).toBeNull();
  });
});
