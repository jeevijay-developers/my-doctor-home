import { afterEach, describe, expect, it, vi } from "vitest";
import { buildClinicBody, buildPractitionerBody } from "./clinicBody";
import {
  buildDoctorJsonLd, buildDoctorMeta, buildPractitionerJsonLd, buildPractitionerMeta, seoClinicName,
} from "./doctorSeo";
import { jsonForScript } from "./injectHead";

const origin = "https://doctylia.com";
const profile = {
  slug: "sharma-clinic", full_name: "anita sharma", display_name: "Anita Sharma", clinic_name: "Sharma Clinic",
  specialization: "Dentist", city: "Kota", state: "Rajasthan", address: "12 Gandhi Marg", phone: "9876543210",
  profile_photo_url: "https://cdn.example.com/owner.jpg",
};
const BIO = "Ravi treats children and adults with braces and aligners and has done so for ten years.";
const pA: any = { id: "p1", slug: "anita", display_name: "Anita Sharma", specialization: "Dentist", bio: BIO, is_active: true, consultation_fee: 500 };
const pB: any = { id: "p2", slug: "ravi", display_name: "Ravi Kumar", specialization: "ENT", bio: "", is_active: true, consultation_fee: 500 };
const team = [pA, pB];
const row = (pid: string, day: number, s: string, e: string) => ({ practitioner_id: pid, day_of_week: day, is_open: true, start_time: s, end_time: e, start_time_2: null, end_time_2: null });

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("../siteSwitches");
});

describe("team clinic meta", () => {
  it("title: clinic name, up to 3 distinct specialties, city", () => {
    const four = [
      { ...pA, specialization: "Dentist" }, { ...pB, specialization: "ENT" },
      { id: "p3", slug: "c", display_name: "C", specialization: "dentist" }, { id: "p4", slug: "d", display_name: "D", specialization: "Skin" },
      { id: "p5", slug: "e", display_name: "E", specialization: "Heart" },
    ];
    expect(buildDoctorMeta({ origin, profile, practitioners: four } as never).title).toBe("Sharma Clinic - Dentist, ENT, Skin in Kota | Doctylia");
  });
  it("falls back to the owner's name (Dr. exactly once) when there is no clinic_name", () => {
    const p = { ...profile, clinic_name: "  " };
    expect(seoClinicName(p)).toBe("Dr. Anita Sharma");
    expect(buildDoctorMeta({ origin, profile: p, practitioners: team } as never).title).toBe("Dr. Anita Sharma - Dentist, ENT in Kota | Doctylia");
    expect(seoClinicName({ ...p, display_name: "Dr. Anita Sharma" })).toBe("Dr. Anita Sharma");
  });
  it("omits the specialty and city parts when missing", () => {
    const noSpec = team.map((p) => ({ ...p, specialization: null }));
    const m = buildDoctorMeta({ origin, profile: { ...profile, city: null }, practitioners: noSpec } as never);
    expect(m.title).toBe("Sharma Clinic | Doctylia");
    expect(m.description).toBe("Sharma Clinic has 2 doctors. Book an appointment online and see timings, fees, services and patient reviews on Doctylia.");
  });
  it("description names the clinic and the doctor count", () => {
    const m = buildDoctorMeta({ origin, profile, practitioners: team } as never);
    expect(m.description).toContain("Sharma Clinic in Kota has 2 doctors (Dentist, ENT)");
  });
  it("custom seo_title / seo_description still win", () => {
    const m = buildDoctorMeta({ origin, profile, practitioners: team, settings: { seo_title: " My title ", seo_description: " My text " } } as never);
    expect(m.title).toBe("My title");
    expect(m.description).toBe("My text");
  });
  it("the owner's bio is never the clinic description", () => {
    const m = buildDoctorMeta({ origin, profile: { ...profile, bio: "I am the owner and this is my personal story." }, practitioners: team } as never);
    expect(m.description).not.toContain("personal story");
  });
  it("og:image: hero photo, then clinic gallery photo, then the owner's portrait", () => {
    const img = (extra: object) => buildDoctorMeta({ origin, profile, practitioners: team, ...extra } as never).image;
    expect(img({ settings: { hero_photo_url: "https://cdn.example.com/hero.jpg" }, clinicImage: "https://cdn.example.com/g.jpg" })).toBe("https://cdn.example.com/hero.jpg");
    expect(img({ settings: {}, clinicImage: "https://cdn.example.com/g.jpg" })).toBe("https://cdn.example.com/g.jpg");
    expect(img({ settings: { hero_photo_url: "  " }, clinicImage: null })).toBe("https://cdn.example.com/owner.jpg");
    expect(img({})).toBe("https://cdn.example.com/owner.jpg");
  });
  it("a deactivated second doctor falls back to the single-doctor output, byte for byte", () => {
    const single = buildDoctorMeta({ origin, profile } as never);
    expect(buildDoctorMeta({ origin, profile, practitioners: [pA, { ...pB, is_active: false }] } as never)).toEqual(single);
    expect(single.title).toBe("Dr. Anita Sharma - Dentist in Kota | Doctylia");
    const ldSingle = JSON.stringify(buildDoctorJsonLd({ origin, profile } as never));
    expect(JSON.stringify(buildDoctorJsonLd({ origin, profile, practitioners: [pA, { ...pB, is_active: false }] } as never))).toBe(ldSingle);
  });
  it("2 active but 1 unlisted still counts as a team clinic", () => {
    const m = buildDoctorMeta({ origin, profile, practitioners: [pA, { ...pB, directory_listed: false }] } as never);
    expect(m.title).toBe("Sharma Clinic - Dentist, ENT in Kota | Doctylia");
  });
});

describe("team clinic JSON-LD", () => {
  const ld = (extra: object = {}): any => buildDoctorJsonLd({ origin, profile, practitioners: team, ...extra } as never);

  it("main node is the clinic itself", () => {
    const main = ld()["@graph"][0];
    expect(main["@type"]).toEqual(["MedicalClinic", "MedicalBusiness"]);
    expect(main.name).toBe("Sharma Clinic");
    expect(main.address.addressLocality).toBe("Kota");
    expect(main.telephone).toBe("9876543210");
    // Changed deliberately: the clinic lists the specialties of all its doctors (not the owner's alone).
    expect(main.medicalSpecialty).toEqual(["Dentist", "ENT"]);
  });
  it("drops the clinic-level aggregateRating even when the clinic has reviews", () => {
    expect(ld({ reviews: [{ rating: 5 }, { rating: 4 }] })["@graph"][0].aggregateRating).toBeUndefined();
  });
  it("keeps the single-doctor rating for a single-doctor clinic", () => {
    const single: any = buildDoctorJsonLd({ origin, profile, reviews: [{ rating: 5 }] } as never);
    expect(single["@graph"][0].aggregateRating.ratingValue).toBe("5.0");
  });
  it("priceRange is a range of the doctors' fees, never the owner's single fee, and absent when all equal or unknown", () => {
    const withFee = ld({ practitioners: [pA, { ...pB, consultation_fee: 900 }], profile: { ...profile, consultation_fee: 200 } });
    expect(withFee["@graph"][0].priceRange).toBe("₹500-₹900");
    expect(ld({ profile: { ...profile, consultation_fee: 200 } })["@graph"][0].priceRange).toBeUndefined();
    expect(ld({ practitioners: [{ ...pA, consultation_fee: null }, { ...pB, consultation_fee: undefined }] })["@graph"][0].priceRange).toBeUndefined();
  });
  it("openingHoursSpecification comes from the clinic's hours, and is absent without rows", () => {
    expect(ld()["@graph"][0].openingHoursSpecification).toBeUndefined();
    const hours = ld({ workingHours: [row("p1", 1, "09:00", "13:00"), row("p2", 1, "10:00", "14:00")] })["@graph"][0].openingHoursSpecification;
    expect(hours).toEqual([{ "@type": "OpeningHoursSpecification", dayOfWeek: "Monday", opens: "09:00", closes: "14:00" }]);
  });
  it("logo only when the settings carry one", () => {
    expect(ld()["@graph"][0].logo).toBeUndefined();
    expect(ld({ settings: { logo_url: "https://cdn.example.com/logo.png" } })["@graph"][0].logo).toBe("https://cdn.example.com/logo.png");
  });
  it("embeds listed doctors only (an opted-out doctor is not advertised), with ids matching the doctor pages", () => {
    const g = ld({ practitioners: [pA, pB, { id: "p3", slug: "hidden", display_name: "Hidden Doc", is_active: true, directory_listed: false }] })["@graph"][0];
    expect(g.member.map((m: any) => m["@id"])).toEqual([
      "https://doctylia.com/dr/sharma-clinic/doctor/anita#physician",
      "https://doctylia.com/dr/sharma-clinic/doctor/ravi#physician",
    ]);
    const pageId = (buildPractitionerJsonLd({ origin, profile, practitioner: pA }) as any)["@graph"][0]["@id"];
    expect(g.member[0]["@id"]).toBe(pageId);
  });
  it("no hub crumbs while the directory is hidden; crumb uses the clinic name", () => {
    const crumbs = ld()["@graph"][1].itemListElement.map((c: any) => [c.name, c.item]);
    expect(crumbs).toEqual([["Doctylia", "https://doctylia.com/"], ["Sharma Clinic", "https://doctylia.com/dr/sharma-clinic"]]);
  });
  it("hub crumbs come back when the directory is switched on", async () => {
    vi.resetModules();
    vi.doMock("../siteSwitches", () => ({ DIRECTORY_HIDDEN: false }));
    const mod = await import("./doctorSeo");
    const out: any = mod.buildDoctorJsonLd({ origin, profile, practitioners: team } as never);
    expect(out["@graph"][1].itemListElement.map((c: any) => c.name)).toEqual(["Doctylia", "Doctors", "Kota", "Sharma Clinic"]);
  });
  it("special characters in names stay data: serialised JSON never contains a raw '<'", () => {
    const evil = { ...pB, display_name: "Ravi </script><img src=x> & Co", specialization: "ENT \"quoted\"" };
    const out = buildDoctorJsonLd({ origin, profile: { ...profile, clinic_name: "A </script> Clinic" }, practitioners: [pA, evil] } as never);
    const text = jsonForScript(out);
    expect(text).not.toContain("<");
    expect(JSON.parse(text)["@graph"][0].name).toBe("A </script> Clinic");
  });
});

describe("per-doctor meta and JSON-LD", () => {
  it("image: own photo, then clinic image, never the owner's portrait", () => {
    const m = (practitioner: any, extra: object = {}) => buildPractitionerMeta({ origin, profile, practitioner, ...extra }).image;
    expect(m({ ...pB, photo_url: "https://cdn.example.com/b.jpg" }, { clinicImage: "https://cdn.example.com/c.jpg" })).toBe("https://cdn.example.com/b.jpg");
    expect(m(pB, { clinicImage: "https://cdn.example.com/c.jpg" })).toBe("https://cdn.example.com/c.jpg");
    expect(m(pB, { settings: { hero_photo_url: "https://cdn.example.com/h.jpg" } })).toBe("https://cdn.example.com/h.jpg");
    expect(m(pB)).toBe("");
  });
  it("generated description names the clinic (not the owner's possessive) when there is a clinic_name", () => {
    expect(buildPractitionerMeta({ origin, profile, practitioner: pB }).description).toContain("at Sharma Clinic.");
    expect(buildPractitionerMeta({ origin, profile: { ...profile, clinic_name: null }, practitioner: pB }).description).toContain("at Dr. Anita Sharma's clinic.");
  });
  it("worksFor carries the clinic's name and url; breadcrumb uses the clinic name; address, phone, fee and only own hours", () => {
    const out: any = buildPractitionerJsonLd({
      origin, profile, practitioner: { ...pB, consultation_fee: 700 },
      workingHours: [row("p1", 1, "09:00", "13:00"), row("p2", 2, "10:00", "12:00")],
    });
    const doc = out["@graph"][0];
    expect(doc.worksFor).toEqual({ "@type": "MedicalClinic", "@id": "https://doctylia.com/dr/sharma-clinic#clinic", name: "Sharma Clinic", url: "https://doctylia.com/dr/sharma-clinic" });
    expect(doc.address.addressLocality).toBe("Kota");
    expect(doc.telephone).toBe("9876543210");
    expect(doc.priceRange).toBe("₹700");
    expect(doc.openingHoursSpecification).toEqual([{ "@type": "OpeningHoursSpecification", dayOfWeek: "Tuesday", opens: "10:00", closes: "12:00" }]);
    expect(out["@graph"][1].itemListElement.map((c: any) => c.name)).toEqual(["Doctylia", "Sharma Clinic", "Dr. Ravi Kumar"]);
  });
  it("omits fee, hours and rating when there is nothing to say", () => {
    const doc: any = (buildPractitionerJsonLd({ origin, profile, practitioner: { ...pB, consultation_fee: null } }) as any)["@graph"][0];
    expect(doc.priceRange).toBeUndefined();
    expect(doc.openingHoursSpecification).toBeUndefined();
    expect(doc.aggregateRating).toBeUndefined();
  });
});

describe("buildClinicBody (crawler HTML)", () => {
  const body = (extra: object = {}) =>
    buildClinicBody({ profile, description: "Desc", practitioners: team, services: [{ name: "Braces", price: 4000 }], workingHours: [row("p1", 1, "09:00", "13:00")], ...extra } as never);

  it("lists every active listed doctor with a link to their page, plus services, hours, address and phone", () => {
    const html = body();
    expect(html).toContain('<a href="/dr/sharma-clinic/doctor/anita">Dr. Anita Sharma</a>');
    expect(html).toContain('<a href="/dr/sharma-clinic/doctor/ravi">Dr. Ravi Kumar</a>');
    expect(html).toContain("<h1>Sharma Clinic - Dentist, ENT</h1>");
    expect(html).toContain("Braces - &#8377;4000");
    expect(html).toContain("Monday: 9:00 AM - 1:00 PM");
    expect(html).toContain("Address: 12 Gandhi Marg, Kota, Rajasthan");
    expect(html).toContain("Phone: 9876543210");
  });
  it("leaves out unlisted and deactivated doctors", () => {
    const html = body({ practitioners: [pA, pB, { id: "p3", slug: "gone", display_name: "Gone Doc", is_active: false }, { id: "p4", slug: "hid", display_name: "Hid Doc", directory_listed: false }] });
    expect(html).not.toContain("Gone Doc");
    expect(html).not.toContain("Hid Doc");
  });
  it("shows a bio snippet (cut at a word) and nothing for an empty bio", () => {
    const long = `${"word ".repeat(100)}end`;
    const html = body({ practitioners: [{ ...pA, bio: long }, pB] });
    expect(html).toMatch(/<p>(word ){10,}word\.\.\.<\/p>/);
    expect(body()).not.toContain("<p></p>");
  });
  it("has no directory (hub) links while the directory is hidden", () => {
    expect(body()).not.toContain("/doctors");
  });
  it("escapes hostile names, bios and services", () => {
    const evil = { ...pA, display_name: "<img src=x onerror=alert(1)> Doc", bio: "<script>alert(2)</script> & more text that goes on", slug: "a\"b" };
    const html = body({ practitioners: [evil, pB], services: [{ name: "<b>X</b>" }], profile: { ...profile, clinic_name: "<i>Clinic</i>", address: "1 <x> Road" } });
    expect(html).not.toMatch(/<(img|script|b|i|x)[ >]/);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('href="/dr/sharma-clinic/doctor/a%22b"');
  });
  it("renders without optional parts (no hours, services, phone)", () => {
    const html = body({ services: [], workingHours: [], profile: { ...profile, phone: null, address: null, city: null, state: null } });
    expect(html).not.toContain("Clinic hours");
    expect(html).not.toContain("<h2>Services");
    expect(html).not.toContain("Phone:");
    expect(html).toContain("Our doctors");
  });
});

describe("buildPractitionerBody (crawler HTML)", () => {
  const body = (extra: object = {}) =>
    buildPractitionerBody({
      profile, practitioner: { ...pA, qualifications: "BDS", experience_years: 12, registration_number: "R-1" }, description: "Desc",
      services: [{ name: "Root canal", price: 3000 }],
      workingHours: [row("p1", 1, "09:00", "13:00"), row("p2", 2, "10:00", "12:00")], ...extra,
    } as never);

  it("has the clinic breadcrumb, full bio, fee, services by the doctor, own hours, address and phone", () => {
    const html = body();
    expect(html).toContain('<a href="/dr/sharma-clinic">Sharma Clinic</a> / Dr. Anita Sharma');
    expect(html).toContain(`<h2>About Dr. Anita Sharma</h2><p>${BIO}</p>`);
    expect(html).toContain("Consultation fee: &#8377;500");
    expect(html).toContain("Services by Dr. Anita Sharma");
    expect(html).toContain("Monday: 9:00 AM - 1:00 PM");
    expect(html).not.toContain("Tuesday");
    expect(html).toContain("Address: 12 Gandhi Marg");
    expect(html).toContain("Phone: 9876543210");
    expect(html).toContain("Registration no. R-1");
  });
  it("omits the About section for an empty bio and escapes everything", () => {
    expect(body({ practitioner: pB })).not.toContain("About Dr. Ravi");
    const html = body({ practitioner: { ...pA, bio: "<script>x</script>", display_name: "<b>Evil</b>" }, services: [{ name: "<u>S</u>" }] });
    expect(html).not.toMatch(/<(script|b|u)>/);
  });
});
