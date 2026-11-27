import { describe, expect, it } from "vitest";
import { reminderDoctorName, stripDrPrefix } from "./checkupDoctor.ts";

describe("reminderDoctorName", () => {
  const second = { display_name: "Dr utkarsh vijay", user_id: "u2" };
  it("single-doctor clinic keeps the owner name", () => {
    expect(reminderDoctorName("yash", "o", 1, second)).toBe("yash");
  });
  it("names the doctor of the last visit in a multi-doctor clinic", () => {
    expect(reminderDoctorName("yash", "o", 2, second)).toBe("utkarsh vijay");
  });
  it("falls back to the owner when there is no visit, an owner row or a blank name", () => {
    expect(reminderDoctorName("yash", "o", 2, null)).toBe("yash");
    expect(reminderDoctorName("yash", "o", 2, { display_name: "Dr yash", user_id: "o" })).toBe("yash");
    expect(reminderDoctorName("yash", "o", 2, { display_name: "  ", user_id: "u2" })).toBe("yash");
  });
  it("strips Dr only as a prefix word", () => {
    expect(stripDrPrefix("Dr. Ann")).toBe("Ann");
    expect(stripDrPrefix("Drake")).toBe("Drake");
  });
});
