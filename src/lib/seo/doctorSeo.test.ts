import { describe, expect, it } from "vitest";
import {
  DEFAULT_DESCRIPTION,
  buildDoctorJsonLd,
  buildDoctorMeta,
  buildPractitionerJsonLd,
  doctorDisplayName,
  doctorHubPaths,
  formatDoctorName,
  normalizePersonName,
} from "./doctorSeo";

const origin = "https://doctylia.com";
const base = { slug: "dr-a", full_name: "Anita Sharma", specialization: "Dentist", city: "Kota" };

describe("normalizePersonName", () => {
  it("title-cases single-case names, collapses whitespace", () => {
    expect(normalizePersonName("  pooja   SHARMA".toLowerCase())).toBe("Pooja Sharma");
    expect(normalizePersonName("ANITA   SHARMA")).toBe("Anita Sharma");
  });
  it("handles separators . - ' ", () => {
    expect(normalizePersonName("a.k. singh")).toBe("A.K. Singh");
    expect(normalizePersonName("mary-jane o'neil")).toBe("Mary-Jane O'Neil");
  });
  it("leaves mixed case alone and handles empty/nullish", () => {
    expect(normalizePersonName("Ravi van der Berg")).toBe("Ravi van der Berg");
    expect(normalizePersonName("")).toBe("");
    expect(normalizePersonName("   ")).toBe("");
    expect(normalizePersonName(null as unknown as string)).toBe("");
  });
  it("leaves non-latin names unchanged", () => {
    expect(normalizePersonName("अनीता शर्मा")).toBe("अनीता शर्मा");
  });
});

describe("formatDoctorName / doctorDisplayName", () => {
  it("adds Dr. exactly once", () => {
    expect(formatDoctorName("sharma")).toBe("Dr. Sharma");
    expect(formatDoctorName("Dr. Sharma")).toBe("Dr. Sharma");
    expect(formatDoctorName("dr sharma")).toBe("Dr Sharma");
    expect(formatDoctorName("DR. SHARMA")).toBe("Dr. Sharma");
  });
  it("does not treat names starting with 'Dr' letters as the title", () => {
    expect(formatDoctorName("drishti rao")).toBe("Dr. Drishti Rao");
  });
  it("returns empty string for empty", () => {
    expect(formatDoctorName("")).toBe("");
  });
  it("does not double the title for 'Dr.Sharma'", () => {
    expect(formatDoctorName("Dr.Sharma")).toBe("Dr. Sharma");
  });
  it("display name prefers display_name, then full_name; handles null profile", () => {
    expect(doctorDisplayName({ display_name: "ravi", full_name: "Other" })).toBe("Dr. Ravi");
    expect(doctorDisplayName(null)).toBe("");
    expect(doctorDisplayName({})).toBe("");
  });
  it("whitespace-only display_name falls back to full_name", () => {
    expect(doctorDisplayName({ display_name: "  ", full_name: "meera" })).toBe("Dr. Meera");
  });
});

describe("buildDoctorMeta", () => {
  it("title includes specialization and city", () => {
    expect(buildDoctorMeta({ origin, profile: base }).title).toBe("Dr. Anita Sharma - Dentist in Kota | Doctylia");
  });
  it("omits missing specialization/city parts", () => {
    expect(buildDoctorMeta({ origin, profile: { full_name: "Anita Sharma" } }).title).toBe("Dr. Anita Sharma | Doctylia");
  });
  it("custom seo_title/seo_description (trimmed) win; blank ones are ignored", () => {
    const m = buildDoctorMeta({ origin, profile: base, settings: { seo_title: "  Custom ", seo_description: " Desc " } });
    expect(m.title).toBe("Custom");
    expect(m.description).toBe("Desc");
    const blank = buildDoctorMeta({ origin, profile: base, settings: { seo_title: "  ", seo_description: "" } });
    expect(blank.title).toContain("Dr. Anita Sharma");
  });
  it("description falls back bio (160 chars) -> hero -> generated", () => {
    const bio = "b".repeat(200);
    // Changed deliberately: a long bio is cut at a word boundary with an ellipsis (still <= 160), not mid-word.
    expect(buildDoctorMeta({ origin, profile: { ...base, bio } }).description).toBe(`${"b".repeat(159)}…`);
    const words = "word ".repeat(60);
    const cut = buildDoctorMeta({ origin, profile: { ...base, bio: words } }).description;
    expect(cut.length).toBeLessThanOrEqual(160);
    expect(cut.endsWith("word…")).toBe(true);
    expect(buildDoctorMeta({ origin, profile: base, settings: { hero_description: "Custom hero" } }).description).toBe("Custom hero");
    expect(buildDoctorMeta({ origin, profile: base, settings: { hero_description: "h".repeat(300) } }).description).toHaveLength(160);
    expect(buildDoctorMeta({ origin, profile: base, settings: { hero_description: "h".repeat(300) } }).description.endsWith("…")).toBe(true);
  });
  it("skips the shared placeholder hero text", () => {
    const m = buildDoctorMeta({
      origin,
      profile: { ...base, experience_years: 5 },
      settings: { hero_description: "Compassionate, personalized and professional healthcare for a better tomorrow." },
    });
    expect(m.description).toMatch(/^Book an appointment with Dr. Anita Sharma, Dentist in Kota \(5\+ years experience\)/);
  });
  it("generated description omits optional parts", () => {
    expect(buildDoctorMeta({ origin, profile: { full_name: "Anita" } }).description).toMatch(/^Book an appointment with Dr. Anita\. /);
  });
  it("falls back to the site default with no name, and empty title", () => {
    const m = buildDoctorMeta({ origin, profile: {} });
    expect(m.description).toBe(DEFAULT_DESCRIPTION);
    expect(m.title).toBe("");
    expect(m.canonical).toBe("");
  });
  it("canonical and image", () => {
    expect(buildDoctorMeta({ origin, profile: base }).canonical).toBe("https://doctylia.com/dr/dr-a");
    expect(buildDoctorMeta({ origin, profile: { ...base, profile_photo_url: "p" }, settings: { hero_photo_url: "h" } }).image).toBe("p");
    expect(buildDoctorMeta({ origin, profile: base, settings: { hero_photo_url: "h" } }).image).toBe("h");
    expect(buildDoctorMeta({ origin, profile: base }).image).toBe("");
  });
});

describe("doctorHubPaths", () => {
  it("builds city and specialty paths with slugs", () => {
    expect(doctorHubPaths({ city: " New Delhi ", specialization: "ENT / Throat" })).toEqual({
      cityPath: "/doctors/new-delhi",
      cityName: "New Delhi",
      specialtyPath: "/doctors/new-delhi/ent-throat",
      specialtyName: "ENT / Throat",
    });
  });
  it("no city -> no specialty path either (but keeps specialty name)", () => {
    expect(doctorHubPaths({ specialization: "Dentist" })).toMatchObject({ cityPath: null, specialtyPath: null, specialtyName: "Dentist" });
  });
  it("no specialty -> only the city path", () => {
    expect(doctorHubPaths({ city: "Kota" })).toMatchObject({ cityPath: "/doctors/kota", specialtyPath: null, specialtyName: null });
  });
  it("handles null/empty profile and punctuation-only values", () => {
    expect(doctorHubPaths(null)).toEqual({ cityPath: null, cityName: null, specialtyPath: null, specialtyName: null });
    expect(doctorHubPaths({ city: "---" }).cityPath).toBeNull();
  });
});

describe("buildDoctorJsonLd", () => {
  const find = (ld: any, type: string) => ld["@graph"].find((n: any) => [n["@type"]].flat().includes(type));

  it("returns null without a profile or a name", () => {
    expect(buildDoctorJsonLd({ origin, profile: null })).toBeNull();
    expect(buildDoctorJsonLd({ origin, profile: { slug: "x" } })).toBeNull();
  });

  it("builds a Physician + BreadcrumbList graph", () => {
    const ld = buildDoctorJsonLd({ origin, profile: { ...base, consultation_fee: 500, clinic_phone: "+911", phone: "+912" } })!;
    expect(ld["@context"]).toBe("https://schema.org");
    const p = find(ld, "Physician");
    expect(p).toMatchObject({
      "@id": "https://doctylia.com/dr/dr-a#physician",
      name: "Dr. Anita Sharma",
      medicalSpecialty: "Dentist",
      telephone: "+911",
      priceRange: "₹500",
    });
    const crumbs = find(ld, "BreadcrumbList").itemListElement;
    expect(crumbs.map((c: any) => c.name)).toEqual(["Doctylia", "Doctors", "Kota", "Dentist", "Dr. Anita Sharma"]);
    expect(crumbs.map((c: any) => c.position)).toEqual([1, 2, 3, 4, 5]);
  });

  it("breadcrumbs skip hubs when the city is missing", () => {
    const ld = buildDoctorJsonLd({ origin, profile: { slug: "x", full_name: "Anita" } })!;
    expect(find(ld, "BreadcrumbList").itemListElement.map((c: any) => c.name)).toEqual(["Doctylia", "Dr. Anita"]);
    // canonical falls back to origin only when no slug; with slug it is the doctor url
  });

  it("uses origin as canonical when the profile has no slug", () => {
    const ld = buildDoctorJsonLd({ origin, profile: { full_name: "Anita" } })!;
    expect(find(ld, "Physician").url).toBe(origin);
  });

  it("aggregates only positive numeric ratings, to one decimal", () => {
    const ld = buildDoctorJsonLd({
      origin,
      profile: base,
      reviews: [{ rating: 5 }, { rating: 4 }, { rating: 0 }, { rating: "5" }, { rating: null }, {}],
    })!;
    expect(find(ld, "Physician").aggregateRating).toEqual({
      "@type": "AggregateRating",
      ratingValue: "4.5",
      reviewCount: "2",
      bestRating: "5",
      worstRating: "1",
    });
  });
  it("omits aggregateRating with no valid reviews", () => {
    expect(find(buildDoctorJsonLd({ origin, profile: base, reviews: [{ rating: 0 }] })!, "Physician").aggregateRating).toBeUndefined();
    expect(find(buildDoctorJsonLd({ origin, profile: base })!, "Physician").aggregateRating).toBeUndefined();
  });

  it("address: locality appended only if not already in the address; omitted when empty", () => {
    const withLoc = find(buildDoctorJsonLd({ origin, profile: { ...base, address: "12 Rd", locality: "Talwandi", state: "Rajasthan", pincode: "324005" } })!, "Physician").address;
    expect(withLoc).toEqual({
      "@type": "PostalAddress",
      streetAddress: "12 Rd, Talwandi",
      addressLocality: "Kota",
      addressRegion: "Rajasthan",
      postalCode: "324005",
      addressCountry: "IN",
    });
    const dup = find(buildDoctorJsonLd({ origin, profile: { ...base, address: "12 Rd, TALWANDI", locality: "talwandi" } })!, "Physician").address;
    expect(dup.streetAddress).toBe("12 Rd, TALWANDI");
    const none = find(buildDoctorJsonLd({ origin, profile: { slug: "x", full_name: "Anita" } })!, "Physician");
    expect(none.address).toBeUndefined();
  });

  it("sameAs only keeps http(s) URLs; hasMap only valid Google Maps links", () => {
    const p = find(
      buildDoctorJsonLd({
        origin,
        profile: { ...base, google_maps_url: " https://maps.app.goo.gl/abc " },
        settings: { social_facebook: "https://fb.com/x", social_instagram: "javascript:alert(1)", social_linkedin: "", social_youtube: "http://yt.com/y" },
      })!,
      "Physician",
    );
    expect(p.sameAs).toEqual(["https://fb.com/x", "http://yt.com/y"]);
    expect(p.hasMap).toBe("https://maps.app.goo.gl/abc");
    const bad = find(buildDoctorJsonLd({ origin, profile: { ...base, google_maps_url: "https://evil.com/maps" } })!, "Physician");
    expect(bad.hasMap).toBeUndefined();
    expect(bad.sameAs).toBeUndefined();
  });

  it("services: capped at 12, optional description and offer", () => {
    const services = Array.from({ length: 15 }, (_, i) => ({ name: `S${i}`, price: i === 0 ? 100 : 0, description: i === 1 ? "d" : "" }));
    const svc = find(buildDoctorJsonLd({ origin, profile: base, services })!, "Physician").availableService;
    expect(svc).toHaveLength(12);
    expect(svc[0].offers).toEqual({ "@type": "Offer", price: "100", priceCurrency: "INR" });
    expect(svc[1].description).toBe("d");
    expect(svc[2].offers).toBeUndefined();
    expect(find(buildDoctorJsonLd({ origin, profile: base, services: [] })!, "Physician").availableService).toBeUndefined();
  });

  it("omits priceRange for a zero/absent fee and telephone when none", () => {
    const p = find(buildDoctorJsonLd({ origin, profile: { ...base, consultation_fee: 0 } })!, "Physician");
    expect(p.priceRange).toBeUndefined();
    expect(p.telephone).toBeUndefined();
  });

  it("output is JSON-serializable", () => {
    expect(() => JSON.stringify(buildDoctorJsonLd({ origin, profile: base }))).not.toThrow();
  });
});

describe("multi-doctor SEO", async () => {
  const { buildPractitionerJsonLd, buildPractitionerMeta } = await import("./doctorSeo");
  const profile = { ...base, display_name: "Anita Sharma", city: "Kota", address: "12 Gandhi Marg" };
  const pA = { id: "p1", slug: "anita", display_name: "Anita Sharma", specialization: "Dentist", qualifications: "BDS, MDS", experience_years: 12, bio: "Dentist with long experience.", photo_url: "https://cdn.example.com/a.jpg", registration_number: "R-1", is_active: true, is_primary: true };
  const pB = { id: "p2", slug: "ravi-kumar", display_name: "ravi kumar", specialization: "Orthodontist", qualifications: "BDS", experience_years: 5, bio: null, photo_url: null, registration_number: null, is_active: true, is_primary: false };

  it("buildPractitionerMeta: title, description, canonical, image", () => {
    const m = buildPractitionerMeta({ origin, profile, practitioner: pB });
    expect(m.title).toBe("Dr. Ravi Kumar - Orthodontist in Kota | Doctylia");
    expect(m.canonical).toBe("https://doctylia.com/dr/dr-a/doctor/ravi-kumar");
    expect(m.description).toContain("Dr. Ravi Kumar");
    expect(m.image).toBe("");
    expect(buildPractitionerMeta({ origin, profile, practitioner: pA }).image).toBe("https://cdn.example.com/a.jpg");
  });

  it("buildPractitionerJsonLd: Physician with worksFor the clinic and a Clinic > Doctor breadcrumb", () => {
    const ld: any = buildPractitionerJsonLd({ origin, profile, practitioner: pB });
    const phys = ld["@graph"][0];
    expect(phys["@type"]).toBe("Physician");
    expect(phys["@id"]).toBe("https://doctylia.com/dr/dr-a/doctor/ravi-kumar#physician");
    // The clinic node is on another page, so worksFor carries its type, name and url, not a bare @id.
    expect(phys.worksFor).toEqual({ "@type": "MedicalClinic", "@id": "https://doctylia.com/dr/dr-a#clinic", name: "Dr. Anita Sharma", url: "https://doctylia.com/dr/dr-a" });
    const crumbs = ld["@graph"][1].itemListElement;
    expect(crumbs.slice(-2).map((c: any) => c.item)).toEqual(["https://doctylia.com/dr/dr-a", "https://doctylia.com/dr/dr-a/doctor/ravi-kumar"]);
  });

  it("multi-doctor clinic main node is a MedicalClinic with embedded Physician members", () => {
    const ld: any = buildDoctorJsonLd({ origin, profile, practitioners: [pA, pB] } as any);
    const main = ld["@graph"][0];
    expect(main["@type"]).toEqual(["MedicalClinic", "MedicalBusiness"]);
    expect(main["@id"]).toBe("https://doctylia.com/dr/dr-a#clinic");
    // Embedded (not bare @id links) so a crawler of the clinic page sees who works there; same @id as each doctor page.
    expect(main.member).toEqual([
      { "@type": "Physician", "@id": "https://doctylia.com/dr/dr-a/doctor/anita#physician", name: "Dr. Anita Sharma", url: "https://doctylia.com/dr/dr-a/doctor/anita", medicalSpecialty: "Dentist", image: "https://cdn.example.com/a.jpg" },
      { "@type": "Physician", "@id": "https://doctylia.com/dr/dr-a/doctor/ravi-kumar#physician", name: "Dr. Ravi Kumar", url: "https://doctylia.com/dr/dr-a/doctor/ravi-kumar", medicalSpecialty: "Orthodontist" },
    ]);
    expect(main.employee).toBeUndefined();
  });

  it("inactive practitioners do not make a clinic multi-doctor", () => {
    const ld: any = buildDoctorJsonLd({ origin, profile, practitioners: [pA, { ...pB, is_active: false }] } as any);
    expect(ld["@graph"][0]["@type"]).toEqual(["Physician", "MedicalBusiness"]);
  });
});

describe("practitioner aggregateRating", () => {
  const prof = { slug: "dr-a", full_name: "A Sharma", city: "Kota" };
  const base = { slug: "ravi", display_name: "Ravi Kumar" };
  const rating = (p: any): any => (buildPractitionerJsonLd({ origin: "https://doctylia.com", profile: prof, practitioner: p }) as any)["@graph"][0].aggregateRating;
  it("is added only when the doctor has reviews", () => {
    expect(rating(base)).toBeUndefined();
    expect(rating({ ...base, review_count: 0, avg_rating: null })).toBeUndefined();
    expect(rating({ ...base, review_count: 3, avg_rating: null })).toBeUndefined();
    expect(rating({ ...base, review_count: 3, avg_rating: 4.66 })).toMatchObject({
      "@type": "AggregateRating", ratingValue: "4.7", reviewCount: "3",
    });
    expect(rating({ ...base, review_count: "2", avg_rating: "4" })).toMatchObject({ ratingValue: "4.0", reviewCount: "2" });
  });
});
