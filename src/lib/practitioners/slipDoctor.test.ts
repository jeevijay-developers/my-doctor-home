import { describe, it, expect } from "vitest";
import { slipDoctor } from "./slipDoctor";

const profile = {
  id: "clinic-1", full_name: "Asha Rao", qualifications: "MBBS", specialization: "General Physician",
  registration_number: "OWN-1", signature_url: "https://x/owner.png",
  clinic_name: "Rao Clinic", address: "12 MG Road", city: "Pune", phone: "9999999999", clinic_email: "c@x.in", slug: "asha-rao",
};

const other = {
  id: "pr-2", user_id: "u-2", display_name: "Vikram Mehta", qualifications: "MBBS, MD", specialization: "Dermatologist",
  registration_number: "MMC-42", signature_url: "https://x/vikram.png",
};

describe("slipDoctor", () => {
  it("lets the practitioner's doctor fields win", () => {
    const out = slipDoctor(profile, other);
    expect(out).toMatchObject({
      full_name: "Vikram Mehta", qualifications: "MBBS, MD", specialization: "Dermatologist",
      registration_number: "MMC-42", signature_url: "https://x/vikram.png",
    });
  });

  it("drops a typed Dr. prefix, since the slip prints its own", () => {
    expect(slipDoctor(profile, { ...other, display_name: "Dr. Vikram Mehta" })?.full_name).toBe("Vikram Mehta");
    expect(slipDoctor(profile, { ...other, display_name: "dr Vikram" })?.full_name).toBe("Vikram");
 
  });

  // Same rule as get_shared_prescription (20261126100500_shared_rx_doctor_names.sql): keep in sync.
  it("strips Dr only when followed by a dot or space, matching the shared-prescription RPC", () => {
    const name = (display_name: string) => slipDoctor(profile, { ...other, display_name })?.full_name;
    expect(name("Dr Meera Shah")).toBe("Meera Shah");
    expect(name("DR.  Meera Shah ")).toBe("Meera Shah");
    expect(name("Drake Patel")).toBe("Drake Patel");
    expect(name("Dr.Meera")).toBe("Dr.Meera");
    expect(name("Dr.")).toBe("Dr.");
  });

  it("keeps the clinic fields from the profile", () => {
    const out = slipDoctor(profile, other);
    expect(out).toMatchObject({
      id: "clinic-1", clinic_name: "Rao Clinic", address: "12 MG Road", city: "Pune",
      phone: "9999999999", clinic_email: "c@x.in", slug: "asha-rao",
    });
  });

  it("falls back to the profile for fields the practitioner leaves empty", () => {
    const out = slipDoctor(profile, { ...other, qualifications: null, registration_number: "", signature_url: "  " });
    expect(out).toMatchObject({ full_name: "Vikram Mehta", qualifications: "MBBS", registration_number: "OWN-1", signature_url: "https://x/owner.png" });
  });

  it("keeps the owner's clinic name when the clinic has none, instead of naming it after the other doctor", () => {
    const out = slipDoctor({ ...profile, clinic_name: null }, other);
    expect(out?.clinic_name).toBe("Dr. Asha Rao Clinic");
  });

  it("returns the very same object with no practitioner", () => {
    expect(slipDoctor(profile, undefined)).toBe(profile);
    expect(slipDoctor(profile, null)).toBe(profile);
  });

  it("returns the very same object for the owner's own practitioner row", () => {
    expect(slipDoctor(profile, { ...other, user_id: "clinic-1" })).toBe(profile);
  });

  it("passes a missing profile through", () => {
    expect(slipDoctor(null, other)).toBeNull();
  });
});
