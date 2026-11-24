import { describe, expect, it } from "vitest";
import { formatClock, getClinicStatus, todaysHours, type WorkingHoursRow } from "./clinicStatus";
import { customClaims, formatQualifications, ratingSummary, telHref, trustFacts, whatsappHref } from "./doctorFacts";

// Builds an instant from an IST wall-clock time; 2026-11-23 is a Monday.
const ist = (isoLocal: string) => new Date(`${isoLocal}+05:30`);

const week = (over: Partial<Record<number, Partial<WorkingHoursRow>>> = {}): WorkingHoursRow[] =>
  [0, 1, 2, 3, 4, 5, 6].map((d) => ({
    day_of_week: d,
    is_open: d !== 0,
    start_time: "09:30:00",
    end_time: "13:00:00",
    start_time_2: "17:00:00",
    end_time_2: "20:00:00",
    ...over[d],
  }));

describe("getClinicStatus (IST)", () => {
  it("is open inside a session and names when it ends", () => {
    expect(getClinicStatus(week(), ist("2026-11-23T10:15:00"))).toMatchObject({ state: "open", label: "Open now · until 1:00 PM" });
    expect(getClinicStatus(week(), ist("2026-11-23T19:59:00"))).toMatchObject({ state: "open", until: "8:00 PM" });
  });

  it("reports the second session during the lunch gap", () => {
    expect(getClinicStatus(week(), ist("2026-11-23T14:00:00"))).toMatchObject({ state: "later-today", label: "Opens today at 5:00 PM" });
  });

  it("points to the next open day after closing, skipping closed days", () => {
    expect(getClinicStatus(week(), ist("2026-11-23T21:00:00"))).toMatchObject({ state: "closed", opensDay: "tomorrow", opensAt: "9:30 AM" });
    // Saturday night -> Sunday closed -> Monday
    expect(getClinicStatus(week(), ist("2026-11-28T21:00:00"))).toMatchObject({ state: "closed", opensDay: "Monday" });
  });

  it("judges by IST even when the browser is elsewhere (instant, not local clock)", () => {
    // 04:45 UTC == 10:15 IST on Monday
    expect(getClinicStatus(week(), new Date("2026-11-23T04:45:00Z")).state).toBe("open");
  });

  it("returns unknown (renders nothing) without usable hours", () => {
    expect(getClinicStatus([], ist("2026-11-23T10:00:00")).state).toBe("unknown");
    expect(getClinicStatus(week({ 1: { start_time: null } }).map((r) => ({ ...r, is_open: false })), ist("2026-11-23T10:00:00")).state).toBe("unknown");
  });

  it("ignores a half-filled second session", () => {
    const hours = week({ 1: { start_time_2: "17:00:00", end_time_2: null } });
    expect(getClinicStatus(hours, ist("2026-11-23T14:00:00"))).toMatchObject({ state: "closed", opensDay: "tomorrow" });
  });

  it("formats today's hours and clock times", () => {
    expect(todaysHours(week(), ist("2026-11-23T08:00:00"))).toBe("9:30 AM – 1:00 PM, 5:00 PM – 8:00 PM");
    expect(formatClock("00:05:00")).toBe("12:05 AM");
    expect(formatClock("12:00")).toBe("12:00 PM");
  });
});

describe("trust facts never invent data", () => {
  it("returns nothing for an empty profile with no reviews", () => {
    expect(trustFacts({ full_name: "Asha Rao" }, [])).toEqual([]);
  });

  it("includes only facts that exist", () => {
    const facts = trustFacts({ experience_years: 12, qualifications: "mbbs, md (paediatrics)" }, [{ rating: 5 }, { rating: 4 }]);
    expect(facts.map((f) => f.id)).toEqual(["experience", "rating", "qualifications"]);
    expect(facts.find((f) => f.id === "rating")).toMatchObject({ value: "4.5", label: "2 reviews" });
    expect(facts.find((f) => f.id === "qualifications")?.value).toBe("MBBS, MD (Paediatrics)");
  });

  it("skips zero experience and unrated reviews", () => {
    expect(trustFacts({ experience_years: 0 }, [{ rating: null }])).toEqual([]);
    expect(ratingSummary([{ rating: 0 }])).toBeNull();
  });
});

describe("formatQualifications", () => {
  it.each([
    ["md", "MD"],
    ["Mbbs", "MBBS"],
    ["MD (Cardiology)", "MD (Cardiology)"],
    ["m.b.b.s, d.c.h", "MBBS, DCH"],
    ["diploma in child health", "Diploma in Child Health"],
    ["ABC", "ABC"],
  ])("%s -> %s", (raw, expected) => expect(formatQualifications(raw)).toBe(expected));
});

describe("contact links", () => {
  it("adds the Indian country code where a bare 10-digit number is stored", () => {
    expect(telHref("98765 43210")).toBe("tel:+919876543210");
    expect(telHref("+91 98765 43210")).toBe("tel:+919876543210");
    expect(whatsappHref({ whatsapp_number: "9876543210" })).toBe("https://wa.me/919876543210");
    expect(whatsappHref({ whatsapp_number: "+91 98765-43210", whatsapp_message: "Hi doctor" })).toBe(
      "https://wa.me/919876543210?text=Hi%20doctor",
    );
    expect(whatsappHref({})).toBe("");
  });
});

describe("customClaims", () => {
  const defaults = JSON.stringify([
    { id: "patients", label: "Patients Treated", value: "5,000+", active: true },
    { id: "experience", label: "Years Experience", value: "", active: true },
    { id: "booking", label: "Online Booking", value: "24/7", active: true },
  ]);

  it("drops values the platform pre-filled (the doctor never typed them)", () => {
    expect(customClaims({ hero_stat_text: "5,000+ Patient Consultations", seo_keywords: defaults })).toEqual([]);
  });

  it("keeps what the doctor actually wrote", () => {
    const own = JSON.stringify([{ id: "patients", label: "Surgeries", value: "1,200+", active: true }]);
    expect(customClaims({ hero_stat_text: "Gold medallist, AIIMS", seo_keywords: own })).toEqual([
      { value: "Gold medallist, AIIMS", label: "" },
      { value: "1,200+", label: "Surgeries" },
    ]);
  });

  it("respects the doctor's show toggles and ignores plain-text keywords", () => {
    expect(customClaims({ hero_stat_text: "Gold medallist", show_hero_stat_badge: false, seo_keywords: "skin, acne" })).toEqual([]);
  });
});
