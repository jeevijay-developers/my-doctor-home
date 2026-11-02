import { describe, expect, it } from "vitest";
import { INDIAN_STATES, formatClinicLocation } from "./formatClinicLocation";

describe("INDIAN_STATES", () => {
  it("is unique, non-empty and alphabetical", () => {
    expect(new Set(INDIAN_STATES).size).toBe(INDIAN_STATES.length);
    expect([...INDIAN_STATES].sort()).toEqual(INDIAN_STATES);
    expect(INDIAN_STATES).toContain("Delhi");
  });
});

describe("formatClinicLocation", () => {
  it("joins city and saved state", () => {
    expect(formatClinicLocation("anything", "Kota", "Rajasthan")).toBe("Kota, Rajasthan");
  });
  it("trims city and state", () => {
    expect(formatClinicLocation(null, "  Kota ", " Rajasthan  ")).toBe("Kota, Rajasthan");
  });
  it("saved state wins over an address match", () => {
    expect(formatClinicLocation("MG Road, Kerala", "Kota", "Rajasthan")).toBe("Kota, Rajasthan");
  });
  it("falls back to scanning the address for a known state, case-insensitively", () => {
    expect(formatClinicLocation("12 MG Road, Pune, MAHARASHTRA 411001", "Pune")).toBe("Pune, Maharashtra");
    expect(formatClinicLocation("near station, tamil nadu", null)).toBe("Tamil Nadu");
  });
  it("treats blank state as missing", () => {
    expect(formatClinicLocation("Jaipur, Rajasthan", "Jaipur", "   ")).toBe("Jaipur, Rajasthan");
  });
  it("returns just city or just state when the other is missing", () => {
    expect(formatClinicLocation(null, "Kota", null)).toBe("Kota");
    expect(formatClinicLocation(null, null, "Goa")).toBe("Goa");
    expect(formatClinicLocation("Somewhere in Gujarat", "  ", undefined)).toBe("Gujarat");
  });
  it("returns null when nothing is resolvable", () => {
    expect(formatClinicLocation()).toBeNull();
    expect(formatClinicLocation("", "", "")).toBeNull();
    expect(formatClinicLocation("12 Some Street", "  ", null)).toBeNull();
  });
  it("matches multi-word states", () => {
    expect(formatClinicLocation("Gangtok, Sikkim", null)).toBe("Sikkim");
    expect(formatClinicLocation("Port Blair, Andaman and Nicobar Islands", "Port Blair")).toBe(
      "Port Blair, Andaman and Nicobar Islands",
    );
  });

  it("does not match a state name that is only a fragment of another word", () => {
    expect(formatClinicLocation("12 Goat Market Road", null)).toBeNull();
  });
});
