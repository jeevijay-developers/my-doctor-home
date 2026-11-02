import { describe, expect, it } from "vitest";
import { getClinicMapsQuery, getClinicMapsUrl } from "./clinicLocation";

const profile = { clinic_name: "Care Clinic", address: "12 MG Road", city: "Kota", state: "Rajasthan" };

describe("getClinicMapsQuery", () => {
  it("joins clinic, address, city and state in order", () => {
    expect(getClinicMapsQuery(profile)).toBe("Care Clinic, 12 MG Road, Kota, Rajasthan");
  });
  it("skips missing/empty parts", () => {
    expect(getClinicMapsQuery({ clinic_name: "C", address: "", city: null, state: "S" })).toBe("C, S");
  });
  it("returns the fallback when nothing is set, or profile is null", () => {
    expect(getClinicMapsQuery({}, "fb")).toBe("fb");
    expect(getClinicMapsQuery(null, "fb")).toBe("fb");
    expect(getClinicMapsQuery(undefined)).toBe("");
  });
  it("ignores the fallback when there is data", () => {
    expect(getClinicMapsQuery({ city: "Kota" }, "fb")).toBe("Kota");
  });
});

describe("getClinicMapsUrl", () => {
  it("builds a Google Maps search URL with an encoded query", () => {
    const url = getClinicMapsUrl({ clinic_name: "A & B", city: "Kota" });
    expect(url).toBe("https://www.google.com/maps/search/?api=1&query=A%20%26%20B%2C%20Kota");
    expect(new URL(url).searchParams.get("query")).toBe("A & B, Kota");
  });
  it("returns an empty string when there is no query at all", () => {
    expect(getClinicMapsUrl({})).toBe("");
    expect(getClinicMapsUrl(null)).toBe("");
  });
  it("uses the fallback to build a URL when profile is empty", () => {
    expect(getClinicMapsUrl({}, "Kota")).toContain("query=Kota");
  });
});
