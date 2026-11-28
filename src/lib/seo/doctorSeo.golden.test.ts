import { describe, expect, it } from "vitest";
import { buildDoctorJsonLd, buildDoctorMeta } from "./doctorSeo";

// Golden output captured from the single-doctor code path BEFORE multi-doctor changes.
// Single-doctor SEO output must stay byte-identical.
const fixture = {
  origin: "https://doctylia.com",
  profile: {
    slug: "dr-anita-sharma", full_name: "anita sharma", display_name: "Anita Sharma", specialization: "Dentist", city: "Kota",
    state: "Rajasthan", pincode: "324005", address: "12 Gandhi Marg", locality: "Talwandi", phone: "9876543210", clinic_phone: "7410000000",
    consultation_fee: 500, experience_years: 12, bio: "Dentist with 12 years of experience in Kota.",
    profile_photo_url: "https://cdn.example.com/anita.jpg", google_maps_url: "https://maps.google.com/?q=kota",
  },
  settings: { hero_photo_url: "https://cdn.example.com/hero.jpg", social_facebook: "https://facebook.com/anita", social_instagram: "not-a-url" },
  services: [{ name: "Root canal", description: "Pain-free RCT", price: 3000 }, { name: "Cleaning", price: 800 }],
  reviews: [{ rating: 5 }, { rating: 4 }, { rating: 0 }],
};

const GOLDEN_META = {
  "title": "Dr. Anita Sharma - Dentist in Kota | Doctylia",
  "description": "Dentist with 12 years of experience in Kota.",
  "canonical": "https://doctylia.com/dr/dr-anita-sharma",
  "image": "https://cdn.example.com/anita.jpg"
};

const GOLDEN_JSONLD = {"@context":"https://schema.org","@graph":[{"@type":["Physician","MedicalBusiness"],"@id":"https://doctylia.com/dr/dr-anita-sharma#physician","name":"Dr. Anita Sharma","url":"https://doctylia.com/dr/dr-anita-sharma","description":"Dentist with 12 years of experience in Kota.","medicalSpecialty":"Dentist","image":"https://cdn.example.com/anita.jpg","telephone":"7410000000","priceRange":"₹500","sameAs":["https://facebook.com/anita"],"hasMap":"https://maps.google.com/?q=kota","address":{"@type":"PostalAddress","streetAddress":"12 Gandhi Marg, Talwandi","addressLocality":"Kota","addressRegion":"Rajasthan","postalCode":"324005","addressCountry":"IN"},"availableService":[{"@type":"MedicalProcedure","name":"Root canal","description":"Pain-free RCT","offers":{"@type":"Offer","price":"3000","priceCurrency":"INR"}},{"@type":"MedicalProcedure","name":"Cleaning","offers":{"@type":"Offer","price":"800","priceCurrency":"INR"}}],"aggregateRating":{"@type":"AggregateRating","ratingValue":"4.5","reviewCount":"2","bestRating":"5","worstRating":"1"}},{"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Doctylia","item":"https://doctylia.com/"},{"@type":"ListItem","position":2,"name":"Doctors","item":"https://doctylia.com/doctors"},{"@type":"ListItem","position":3,"name":"Kota","item":"https://doctylia.com/doctors/kota"},{"@type":"ListItem","position":4,"name":"Dentist","item":"https://doctylia.com/doctors/kota/dentist"},{"@type":"ListItem","position":5,"name":"Dr. Anita Sharma","item":"https://doctylia.com/dr/dr-anita-sharma"}]}]};

describe("doctorSeo golden (single doctor)", () => {
  it("buildDoctorMeta is unchanged", () => {
    expect(buildDoctorMeta(fixture)).toEqual(GOLDEN_META);
  });
  it("buildDoctorJsonLd is byte-identical", () => {
    expect(JSON.stringify(buildDoctorJsonLd(fixture))).toBe(JSON.stringify(GOLDEN_JSONLD));
  });
  it("one active practitioner (or none) does not change the output", () => {
    const one = [{ id: "p1", slug: "anita", display_name: "Anita Sharma" }];
    expect(JSON.stringify(buildDoctorJsonLd({ ...fixture, practitioners: one } as never))).toBe(JSON.stringify(GOLDEN_JSONLD));
    expect(JSON.stringify(buildDoctorJsonLd({ ...fixture, practitioners: [] } as never))).toBe(JSON.stringify(GOLDEN_JSONLD));
  });
});

// Golden for the NEW team-clinic output (2+ active doctors), added deliberately in the multi-doctor
// public-site work: clinic name as the entity, doctors embedded as members, no clinic-level rating,
// no single fee, no hub crumbs while DIRECTORY_HIDDEN.
const teamFixture = {
  origin: "https://doctylia.com",
  profile: {
    slug: "sharma-clinic", full_name: "anita sharma", display_name: "Anita Sharma", clinic_name: "Sharma Dental & ENT Clinic",
    specialization: "Dentist", city: "Kota", state: "Rajasthan", pincode: "324005", address: "12 Gandhi Marg", locality: "Talwandi",
    phone: "9876543210", profile_photo_url: "https://cdn.example.com/anita.jpg", google_maps_url: "https://maps.google.com/?q=kota",
  },
  settings: { hero_photo_url: "https://cdn.example.com/hero.jpg" },
  services: [{ name: "Root canal", price: 3000 }],
  reviews: [{ rating: 5 }],
  practitioners: [
    { id: "p1", slug: "anita-sharma", display_name: "Anita Sharma", specialization: "Dentist", photo_url: "https://cdn.example.com/anita.jpg", consultation_fee: 500, is_active: true },
    { id: "p2", slug: "ravi-kumar", display_name: "ravi kumar", specialization: "ENT", consultation_fee: 800, is_active: true },
    { id: "p3", slug: "meena", display_name: "Meena Rao", specialization: "Dentist", consultation_fee: 600, is_active: true, directory_listed: false },
  ],
  workingHours: [
    { practitioner_id: "p1", day_of_week: 1, is_open: true, start_time: "09:00:00", end_time: "13:00:00", start_time_2: null, end_time_2: null },
    { practitioner_id: "p2", day_of_week: 1, is_open: true, start_time: "10:00:00", end_time: "14:00:00", start_time_2: null, end_time_2: null },
  ],
};

const GOLDEN_TEAM_META = {
  title: "Sharma Dental & ENT Clinic - Dentist, ENT in Kota | Doctylia",
  description: "Sharma Dental & ENT Clinic in Kota has 3 doctors (Dentist, ENT). Book an appointment online and see timings, fees, services and patient reviews on Doctylia.",
  canonical: "https://doctylia.com/dr/sharma-clinic",
  image: "https://cdn.example.com/hero.jpg",
};

const GOLDEN_TEAM_JSONLD = {"@context":"https://schema.org","@graph":[{"@type":["MedicalClinic","MedicalBusiness"],"@id":"https://doctylia.com/dr/sharma-clinic#clinic","name":"Sharma Dental & ENT Clinic","url":"https://doctylia.com/dr/sharma-clinic","description":"Sharma Dental & ENT Clinic in Kota has 3 doctors (Dentist, ENT). Book an appointment online and see timings, fees, services and patient reviews on Doctylia.","image":"https://cdn.example.com/hero.jpg","telephone":"9876543210","hasMap":"https://maps.google.com/?q=kota","address":{"@type":"PostalAddress","streetAddress":"12 Gandhi Marg, Talwandi","addressLocality":"Kota","addressRegion":"Rajasthan","postalCode":"324005","addressCountry":"IN"},"availableService":[{"@type":"MedicalProcedure","name":"Root canal","offers":{"@type":"Offer","price":"3000","priceCurrency":"INR"}}],"priceRange":"₹500-₹800","openingHoursSpecification":[{"@type":"OpeningHoursSpecification","dayOfWeek":"Monday","opens":"09:00","closes":"14:00"}],"member":[{"@type":"Physician","@id":"https://doctylia.com/dr/sharma-clinic/doctor/anita-sharma#physician","name":"Dr. Anita Sharma","url":"https://doctylia.com/dr/sharma-clinic/doctor/anita-sharma","medicalSpecialty":"Dentist","image":"https://cdn.example.com/anita.jpg"},{"@type":"Physician","@id":"https://doctylia.com/dr/sharma-clinic/doctor/ravi-kumar#physician","name":"Dr. Ravi Kumar","url":"https://doctylia.com/dr/sharma-clinic/doctor/ravi-kumar","medicalSpecialty":"ENT"}]},{"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Doctylia","item":"https://doctylia.com/"},{"@type":"ListItem","position":2,"name":"Sharma Dental & ENT Clinic","item":"https://doctylia.com/dr/sharma-clinic"}]}]};

describe("doctorSeo golden (team clinic)", () => {
  it("buildDoctorMeta", () => {
    expect(buildDoctorMeta(teamFixture as never)).toEqual(GOLDEN_TEAM_META);
  });
  it("buildDoctorJsonLd", () => {
    expect(JSON.stringify(buildDoctorJsonLd(teamFixture as never))).toBe(JSON.stringify(GOLDEN_TEAM_JSONLD));
  });
});
