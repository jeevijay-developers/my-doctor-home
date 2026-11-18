import { describe, expect, it } from "vitest";
import { ageError, emailError, genderError, nameError, parseWeight, vitalsErrors, weightError } from "./patientIntake";

describe("patient intake validation", () => {
  it("requires a real name", () => {
    expect(nameError("   ")).toMatch(/required/);
    expect(nameError("A")).toMatch(/full name/);
    expect(nameError("x".repeat(101))).toMatch(/too long/);
    expect(nameError("Ravi Kumar")).toBeNull();
  });

  it("requires an age between 0 and 120", () => {
    expect(ageError("")).toMatch(/required/);
    expect(ageError("121")).toMatch(/valid age/);
    expect(ageError("4.5")).toMatch(/valid age/);
    expect(ageError("0")).toBeNull();
    expect(ageError("120")).toBeNull();
  });

  it("requires a gender from the list", () => {
    expect(genderError("")).toMatch(/gender/);
    expect(genderError("robot")).toMatch(/gender/);
    expect(genderError("female")).toBeNull();
  });

  it("treats weight as optional but range-checked", () => {
    expect(weightError("")).toBeNull();
    expect(weightError("62")).toBeNull();
    expect(weightError("62.5")).toBeNull();
    expect(weightError("62.55")).toMatch(/kg/);
    expect(weightError("0.4")).toMatch(/between/);
    expect(weightError("501")).toMatch(/between/);
    expect(parseWeight("")).toBeNull();
    expect(parseWeight("62.5")).toBe(62.5);
  });

  it("checks email loosely and only when given", () => {
    expect(emailError("")).toBeNull();
    expect(emailError("a@b.co")).toBeNull();
    expect(emailError("not-an-email")).toMatch(/valid email/);
  });

  it("collects every vitals problem at once", () => {
    expect(vitalsErrors({ age: "", gender: "", weight: "9999" })).toEqual({
      age: "Age is required",
      gender: "Select the patient's gender",
      weight: "Enter the weight in kg, e.g. 62 or 62.5",
    });
    expect(vitalsErrors({ age: "30", gender: "male", weight: "" })).toEqual({});
  });
});
