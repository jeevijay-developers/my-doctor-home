import { describe, expect, it } from "vitest";
import { fitTitle, isAutoSeoDescription, isAutoSeoTitle, parseMapsLatLng, titleCandidates, trimDescription } from "./seoText";
import { openDaysSummary } from "./clinicHours";

describe("fitTitle / titleCandidates", () => {
  it("keeps a title that already fits (60 chars is fine)", () => {
    expect(fitTitle(titleCandidates("Sharma Dental & ENT Clinic", ["Dentist", "ENT"], "Kota"))).toBe("Sharma Dental & ENT Clinic - Dentist, ENT in Kota | Doctylia");
  });
  it("drops the brand suffix first", () => {
    const t = fitTitle(titleCandidates("next best clinic", ["Psychiatrist", "Gynecologist"], "Hyderabad"));
    expect(t).toBe("next best clinic - Psychiatrist, Gynecologist in Hyderabad");
    expect(t.length).toBeLessThanOrEqual(60);
  });
  it("then keeps one specialty", () => {
    const t = fitTitle(titleCandidates("Sunrise Multispeciality Clinic", ["Cardiology", "Gynecology"], "Hyderabad"));
    expect(t).toBe("Sunrise Multispeciality Clinic - Cardiology in Hyderabad");
    expect(t.length).toBeLessThanOrEqual(60);
    expect(t).not.toContain("Gynecology");
  });
  it("then clinic and city, then the bare name (never cut mid-word)", () => {
    const name = "Institute of Advanced Medical Sciences and Research Centre";
    expect(fitTitle(titleCandidates(name, ["Cardiology"], "Hyderabad"))).toBe(`${name} in Hyderabad`.length <= 60 ? `${name} in Hyderabad` : name);
    const huge = "A".repeat(40) + " " + "B".repeat(40);
    expect(fitTitle(titleCandidates(huge, ["ENT"], "Kota"))).toBe(huge);
  });
  it("omits missing parts and handles non-ASCII names", () => {
    expect(fitTitle(titleCandidates("डॉ. अनीता क्लिनिक", [], ""))).toBe("डॉ. अनीता क्लिनिक | Doctylia");
    expect(fitTitle(titleCandidates("Clinic", ["Dentist"], ""))).toBe("Clinic - Dentist | Doctylia");
  });
});

describe("trimDescription", () => {
  it("leaves short text alone and collapses whitespace", () => {
    expect(trimDescription("  a \n  b ")).toBe("a b");
  });
  it("cuts at a word boundary within 160 characters", () => {
    const long = "word ".repeat(60);
    const t = trimDescription(long);
    expect(t.length).toBeLessThanOrEqual(160);
    expect(t.endsWith("…")).toBe(true);
    expect(t.endsWith(" …")).toBe(false);
    expect(t.slice(0, -1).split(" ").every((w) => w === "word")).toBe(true);
  });
});

describe("isAutoSeoTitle / isAutoSeoDescription", () => {
  it("recognises the generated doctor-led title, also for a renamed doctor", () => {
    expect(isAutoSeoTitle("Dr. Yash Jangid - Psychiatrist in Hyderabad | Doctylia")).toBe(true);
    expect(isAutoSeoTitle("Dr. Old Name - ENT | Doctylia")).toBe(true);
    expect(isAutoSeoTitle("Dr. Old Name | Doctylia")).toBe(true);
    expect(isAutoSeoTitle("")).toBe(true);
  });
  it("recognises what a builder would produce now", () => {
    expect(isAutoSeoTitle("Sharma Clinic - ENT in Kota | Doctylia", ["Sharma Clinic - ENT in Kota | Doctylia"])).toBe(true);
  });
  it("keeps an owner-written title", () => {
    expect(isAutoSeoTitle("Best ENT Surgeon in Kota")).toBe(false);
    expect(isAutoSeoTitle("Kota ENT Care | Doctylia")).toBe(false);
    expect(isAutoSeoTitle("Dr. Sharma, the trusted name")).toBe(false);
  });
  it("recognises the generated description (old and current shapes)", () => {
    expect(isAutoSeoDescription("Book an appointment with Dr. Yash Jangid, Psychiatrist in Hyderabad (6+ years experience). Clinic timings, fees, services and patient reviews on Doctylia.")).toBe(true);
    expect(isAutoSeoDescription("Sharma Clinic in Kota has 2 doctors (ENT). Book an appointment online and see timings, fees, services and patient reviews on Doctylia.")).toBe(true);
  });
  it("recognises a description copied from the owner's bio (cut at 160 or at a word)", () => {
    const bio = "I treat anxiety, depression and sleep problems with a calm, evidence based approach. ".repeat(4);
    expect(isAutoSeoDescription(bio.replace(/\s+/g, " ").trim().slice(0, 160), [], [bio])).toBe(true);
    expect(isAutoSeoDescription(trimDescription(bio), [], [bio])).toBe(true);
  });
  it("keeps an owner-written description", () => {
    expect(isAutoSeoDescription("Trusted ENT care in Kota. Book today.", [], ["something else"])).toBe(false);
  });
});

describe("parseMapsLatLng", () => {
  it("reads the @lat,lng form", () => {
    expect(parseMapsLatLng("https://www.google.com/maps/place/Clinic/@25.1825,75.8335,17z/data=abc")).toEqual({ latitude: 25.1825, longitude: 75.8335 });
    expect(parseMapsLatLng("https://www.google.com/maps/@-33.8688,151.2093,12z")).toEqual({ latitude: -33.8688, longitude: 151.2093 });
  });
  it("prefers the place pin (!3d!4d) over the map centre", () => {
    expect(parseMapsLatLng("https://www.google.com/maps/place/X/@25.1,75.8,17z/data=!3m1!4b1!4m6!3m5!1s0x0!8m2!3d25.1825!4d75.8335")).toEqual({ latitude: 25.1825, longitude: 75.8335 });
  });
  it("is null for short links, queries, junk and out-of-range numbers", () => {
    for (const u of ["https://maps.app.goo.gl/abc123", "https://maps.google.com/?q=kota", "", null, undefined, "https://x/@95.0,75.8,1z", "https://x/@0,0,1z", "https://x/@abc,def"]) {
      expect(parseMapsLatLng(u)).toBeNull();
    }
  });
});

describe("openDaysSummary", () => {
  const row = (d: number) => ({ day_of_week: d, is_open: true, start_time: "09:00:00", end_time: "17:00:00" });
  it("collapses runs", () => {
    expect(openDaysSummary([1, 2, 3, 4, 5, 6].map(row))).toBe("Monday to Saturday");
    expect(openDaysSummary([1, 3].map(row))).toBe("Monday and Wednesday");
    expect(openDaysSummary([0, 1, 2, 3, 4, 5, 6].map(row))).toBe("every day");
    expect(openDaysSummary([])).toBe("");
  });
});
