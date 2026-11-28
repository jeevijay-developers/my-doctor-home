import { describe, expect, it } from "vitest";
import { buildClinicBody, buildPractitionerBody, buildSingleDoctorBody } from "./clinicBody";
import {
  buildDoctorJsonLd, buildDoctorMeta, buildPractitionerJsonLd, buildPractitionerMeta, splitQualifications,
} from "./doctorSeo";

const origin = "https://doctylia.com";
const profile = {
  slug: "next-best-clinic", full_name: "yash jangid", display_name: "Yash Jangid", clinic_name: "next best clinic",
  specialization: "Psychiatrist", city: "Hyderabad", state: "Telangana", address: "Plot 4, Road 2", phone: "9876543210",
  qualifications: "MBBS, MD (Psychiatry)", registration_number: "TS-12345", experience_years: 6, consultation_fee: 600,
  google_maps_url: "https://www.google.com/maps/place/X/@17.385,78.4867,17z",
  razorpay_payment_enabled: true, razorpay_account_status: "active",
};
const pA: any = { id: "p1", slug: "yash", display_name: "Yash Jangid", specialization: "Psychiatrist", qualifications: "MBBS, MD (Psychiatry)", registration_number: "TS-12345", experience_years: 6, bio: "x".repeat(80), is_active: true, bookable: true, consultation_fee: 600, review_count: 3, avg_rating: 4.7 };
const pB: any = { id: "p2", slug: "meena", display_name: "Meena Rao", specialization: "Gynecologist", is_active: true, bookable: false, consultation_fee: 900 };
const team = [pA, pB];

const AUTO_TITLE = "Dr. Yash Jangid - Psychiatrist in Hyderabad | Doctylia";
const AUTO_DESC = "Book an appointment with Dr. Yash Jangid, Psychiatrist in Hyderabad (6+ years experience). Clinic timings, fees, services and patient reviews on Doctylia.";

describe("stored auto-generated SEO values", () => {
  it("team clinic: the stored doctor-led title and description are ignored", () => {
    const m = buildDoctorMeta({ origin, profile, practitioners: team, settings: { seo_title: AUTO_TITLE, seo_description: AUTO_DESC } } as never);
    expect(m.title).toBe("next best clinic - Psychiatrist, Gynecologist in Hyderabad");
    expect(m.title.length).toBeLessThanOrEqual(60);
    expect(m.description).toContain("next best clinic in Hyderabad has 2 doctors");
    expect(m.description.length).toBeLessThanOrEqual(160);
  });
  it("team clinic: a stale auto title (doctor renamed) is also ignored", () => {
    const m = buildDoctorMeta({ origin, profile, practitioners: team, settings: { seo_title: "Dr. Old Name - Psychiatrist in Pune | Doctylia" } } as never);
    expect(m.title).toContain("next best clinic");
  });
  it("team clinic: a genuinely custom title and description keep winning", () => {
    const m = buildDoctorMeta({ origin, profile, practitioners: team, settings: { seo_title: "Mind and Women Care Hyderabad", seo_description: "Our own words." } } as never);
    expect(m.title).toBe("Mind and Women Care Hyderabad");
    expect(m.description).toBe("Our own words.");
  });
  it("team clinic: the owner's bio stored as the description is not the clinic's description", () => {
    const bio = "I am a psychiatrist who treats anxiety and sleep problems with a calm approach to care.";
    const m = buildDoctorMeta({ origin, profile: { ...profile, bio }, practitioners: team, settings: { seo_description: bio } } as never);
    expect(m.description).not.toContain("psychiatrist who treats");
  });
  it("single doctor: stored auto text equals what is generated, so nothing changes", () => {
    const stored = buildDoctorMeta({ origin, profile, settings: { seo_title: AUTO_TITLE, seo_description: AUTO_DESC } });
    const blank = buildDoctorMeta({ origin, profile, settings: {} });
    expect(stored.title).toBe(AUTO_TITLE);
    expect(blank.title).toBe(AUTO_TITLE);
    expect(stored.description).toBe(AUTO_DESC);
  });
  it("single doctor: a stale auto title follows the current name; a custom one is kept", () => {
    expect(buildDoctorMeta({ origin, profile, settings: { seo_title: "Dr. Old Name - ENT in Pune | Doctylia" } }).title).toBe(AUTO_TITLE);
    expect(buildDoctorMeta({ origin, profile, settings: { seo_title: "Best Psychiatrist Hyderabad" } }).title).toBe("Best Psychiatrist Hyderabad");
  });
  it("missing city and one-doctor clinic (no team layout)", () => {
    const m = buildDoctorMeta({ origin, profile: { ...profile, city: "" }, practitioners: [pA] } as never);
    expect(m.title).toBe("Dr. Yash Jangid - Psychiatrist | Doctylia");
    const t = buildDoctorMeta({ origin, profile: { ...profile, city: null }, practitioners: team } as never);
    expect(t.title).toBe("next best clinic - Psychiatrist, Gynecologist | Doctylia");
  });
  it("a single-doctor bio longer than 160 characters is cut at a word", () => {
    const bio = "Psychiatrist helping adults with anxiety. ".repeat(10);
    const m = buildDoctorMeta({ origin, profile: { ...profile, bio }, settings: {} });
    expect(m.description.length).toBeLessThanOrEqual(160);
    expect(m.description.endsWith("…")).toBe(true);
  });
  it("very long clinic and non-ASCII names still give a sane title", () => {
    const longName = "The Dr. Ramesh Chandra Memorial Multispeciality Hospital and Research Centre";
    const t = buildDoctorMeta({ origin, profile: { ...profile, clinic_name: longName }, practitioners: team } as never).title;
    expect(t).toBe(longName);
    const hi = buildDoctorMeta({ origin, profile: { ...profile, clinic_name: "अनीता क्लिनिक" }, practitioners: team } as never).title;
    expect(hi).toBe("अनीता क्लिनिक - Psychiatrist, Gynecologist in Hyderabad");
  });
  it("the doctor page title keeps the doctor-led shape", () => {
    expect(buildPractitionerMeta({ origin, profile, practitioner: pA }).title).toBe(AUTO_TITLE);
  });
});

const graph = (ld: any) => ld["@graph"][0];

describe("JSON-LD for AI answers and local search", () => {
  const input = { origin, profile, settings: {}, practitioners: team, services: [{ name: "Therapy session", price: 800 }], reviews: [], workingHours: [] } as never;
  it("team clinic node", () => {
    const n = graph(buildDoctorJsonLd(input));
    expect(n["@type"]).toEqual(["MedicalClinic", "MedicalBusiness"]);
    expect(n.medicalSpecialty).toEqual(["Psychiatrist", "Gynecologist"]);
    expect(n.areaServed).toEqual({ "@type": "City", name: "Hyderabad" });
    expect(n.geo).toEqual({ "@type": "GeoCoordinates", latitude: 17.385, longitude: 78.4867 });
    expect(n.knowsAbout).toEqual(["Psychiatrist", "Gynecologist", "Therapy session"]);
    expect(n.paymentAccepted).toBe("Online payment");
    expect(n.currenciesAccepted).toBe("INR");
    expect(n.isAcceptingNewPatients).toBe(true);
    expect(n.potentialAction.target.urlTemplate).toBe("https://doctylia.com/dr/next-best-clinic#booking");
    // credentials and registration belong to a doctor, not the clinic; no clinic-level rating
    expect(n.identifier).toBeUndefined();
    expect(n.hasCredential).toBeUndefined();
    expect(n.aggregateRating).toBeUndefined();
    expect(n["@id"]).toBe("https://doctylia.com/dr/next-best-clinic#clinic");
  });
  it("single-doctor Physician gets the same additions plus credentials", () => {
    const n = graph(buildDoctorJsonLd({ ...(input as any), practitioners: [pA] }));
    expect(n["@type"]).toEqual(["Physician", "MedicalBusiness"]);
    expect(n.identifier).toEqual({ "@type": "PropertyValue", name: "Medical registration number", value: "TS-12345" });
    expect(n.hasCredential).toEqual([
      { "@type": "EducationalOccupationalCredential", name: "MBBS" },
      { "@type": "EducationalOccupationalCredential", name: "MD (Psychiatry)" },
    ]);
    expect(n.potentialAction["@type"]).toBe("ReserveAction");
    expect(n.isAcceptingNewPatients).toBe(true);
  });
  it("skips what the data does not support", () => {
    const bare = { origin, profile: { slug: "x", full_name: "A B", specialization: "ENT" }, settings: {} } as never;
    const n = graph(buildDoctorJsonLd(bare));
    for (const k of ["areaServed", "geo", "paymentAccepted", "currenciesAccepted", "isAcceptingNewPatients", "identifier", "hasCredential"]) expect(n[k]).toBeUndefined();
    const closed = graph(buildDoctorJsonLd({ ...(input as any), practitioners: [{ ...pA, bookable: false }, pB] }));
    expect(closed.isAcceptingNewPatients).toBeUndefined();
    const noPay = graph(buildDoctorJsonLd({ ...(input as any), profile: { ...profile, razorpay_account_status: "pending" } }));
    expect(noPay.paymentAccepted).toBeUndefined();
    const noGeo = graph(buildDoctorJsonLd({ ...(input as any), profile: { ...profile, google_maps_url: "https://maps.app.goo.gl/abc" } }));
    expect(noGeo.geo).toBeUndefined();
  });
  it("doctor page node: registration, credentials, booking action, own availability", () => {
    const n = graph(buildPractitionerJsonLd({ origin, profile, practitioner: pA, services: [{ name: "Therapy session" }] }));
    expect(n.identifier.value).toBe("TS-12345");
    expect(n.hasCredential).toHaveLength(2);
    expect(n.potentialAction.target.urlTemplate).toBe("https://doctylia.com/dr/next-best-clinic/doctor/yash#booking");
    expect(n.isAcceptingNewPatients).toBe(true);
    expect(n.knowsAbout).toEqual(["Psychiatrist", "Therapy session"]);
    expect(n.worksFor["@id"]).toBe("https://doctylia.com/dr/next-best-clinic#clinic");
    expect(graph(buildPractitionerJsonLd({ origin, profile, practitioner: { ...pB } })).isAcceptingNewPatients).toBeUndefined();
  });
  it("splitQualifications keeps commas inside brackets", () => {
    expect(splitQualifications("MBBS, MD (Medicine, Gold Medal); DNB")).toEqual(["MBBS", "MD (Medicine, Gold Medal)", "DNB"]);
    expect(splitQualifications("")).toEqual([]);
  });
});

const rows = [
  { practitioner_id: "p1", day_of_week: 1, is_open: true, start_time: "09:00:00", end_time: "13:00:00" },
  { practitioner_id: "p1", day_of_week: 2, is_open: true, start_time: "09:00:00", end_time: "13:00:00" },
  { practitioner_id: "p1", day_of_week: 3, is_open: true, start_time: "09:00:00", end_time: "13:00:00" },
];
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replace(/\s+([.,:])/g, "$1");

describe("crawler bodies lead with Quick facts", () => {
  it("clinic page", () => {
    const html = buildClinicBody({ origin, profile, description: "d", practitioners: team, services: [{ name: "Therapy", price: 800, duration: 45 }], workingHours: rows, reviews: [{ rating: 5 }, { rating: 4 }] });
    expect(html.indexOf("Quick facts")).toBeLessThan(html.indexOf("Our doctors"));
    expect(html.indexOf("Quick facts")).toBeLessThan(html.indexOf("Address:"));
    const t = text(html);
    expect(t).toContain("next best clinic is a clinic in Hyderabad with 2 doctors: Psychiatrist, Gynecologist.");
    expect(t).toContain("Consultation fees from ₹600.");
    expect(t).toContain("Open Monday to Wednesday.");
    expect(t).toContain("Book online at https://doctylia.com/dr/next-best-clinic#booking.");
    expect(t).toContain("Therapy - &#8377;800 (45 minutes)");
    expect(t).toContain("consultation fee ₹600");
    expect(t).toContain("rated 4.7 from 3 reviews");
    expect(t).toContain("next best clinic is rated 4.5 out of 5 from 2 patient reviews");
    expect(html).toContain("<h2>How to book</h2>");
    expect(t).toContain("Online payment is available");
  });
  it("omits sentences it has no data for (no hours, no fees, no city, no reviews, no online payment)", () => {
    const html = buildClinicBody({ profile: { slug: "c", clinic_name: "Plain Clinic" }, description: "d", practitioners: [{ ...pA, consultation_fee: null, review_count: 0 }, { ...pB, consultation_fee: undefined }] });
    const t = text(html);
    expect(t).toContain("Plain Clinic is a clinic with 2 doctors");
    expect(t).not.toMatch(/Open |Consultation fee|rated|Online payment/);
    expect(t).toContain("Book online at /dr/c#booking.");
  });
  it("single doctor page has the equivalent facts", () => {
    const t = text(buildSingleDoctorBody({ origin, profile, description: "d", services: [{ name: "Therapy", price: 800 }], workingHours: rows, reviews: [] }));
    expect(t).toContain("Dr. Yash Jangid, Psychiatrist, practises in Hyderabad and has 6+ years of experience.");
    expect(t).toContain("Qualifications: MBBS, MD (Psychiatry).");
    expect(t).toContain("Registration no. TS-12345.");
    expect(t).toContain("Consultation fee ₹600.");
    expect(t).toContain("Open Monday to Wednesday.");
    expect(t).toContain("Address: Plot 4, Road 2, Hyderabad, Telangana");
    expect(t).toContain("Phone: 9876543210");
    expect(t).not.toContain("patient review");
  });
  it("doctor page: facts are present even with a short bio", () => {
    const html = buildPractitionerBody({ origin, profile, practitioner: { ...pA, bio: "Short." }, description: "d", services: [{ name: "Therapy", price: 800 }], workingHours: rows });
    const t = text(html);
    expect(t).toContain("Dr. Yash Jangid, Psychiatrist, sees patients at next best clinic in Hyderabad and has 6+ years of experience.");
    expect(t).toContain("Consultation fee ₹600.");
    expect(t).toContain("Therapy - &#8377;800");
    expect(t).toContain("Monday: 9:00 AM - 1:00 PM");
    expect(t).toContain("Address: Plot 4, Road 2");
    expect(t).toContain("Phone: 9876543210");
    expect(t).toContain("https://doctylia.com/dr/next-best-clinic/doctor/yash#booking");
  });
  it("hostile text is escaped everywhere in the bodies", () => {
    const evil = `</p><script>alert(1)</script><img src=x onerror=alert(2)>`;
    const p = { ...profile, clinic_name: evil, city: evil, address: evil, qualifications: evil, registration_number: evil };
    const htmls = [
      buildClinicBody({ origin, profile: p, description: evil, practitioners: [{ ...pA, display_name: evil, qualifications: evil }, pB], services: [{ name: evil, price: evil }], workingHours: rows }),
      buildSingleDoctorBody({ origin, profile: p, description: evil, services: [{ name: evil }], workingHours: rows }),
      buildPractitionerBody({ origin, profile: p, practitioner: { ...pA, display_name: evil, qualifications: evil, bio: evil }, description: evil, services: [{ name: evil }], workingHours: rows }),
    ];
    for (const h of htmls) {
      expect(h).not.toContain("<script");
      expect(h).not.toContain("<img");
    }
  });
});
