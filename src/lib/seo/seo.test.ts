import { describe, expect, it } from "vitest";
import { buildHubHead } from "./directorySeo";
import { buildDoctorJsonLd, buildDoctorMeta, doctorHubPaths, formatDoctorName } from "./doctorSeo";
import { INDEXABLE, NOINDEX, renderPage } from "./injectHead";

const origin = "https://doctylia.com";
const profile = {
  slug: "dr-anita-sharma",
  full_name: "Anita Sharma",
  specialization: "Gynaecologist",
  city: "Kota",
  state: "Rajasthan",
  address: "12 Aerodrome Rd",
  locality: "Talwandi",
  pincode: "324005",
  experience_years: 12,
  phone: "+918619483010",
};

describe("formatDoctorName", () => {
  it("title-cases single-case names and adds the Dr. prefix once", () => {
    expect(formatDoctorName("pooja sharma")).toBe("Dr. Pooja Sharma");
    expect(formatDoctorName("ANITA SHARMA")).toBe("Dr. Anita Sharma");
    expect(formatDoctorName("dr. a.k. singh")).toBe("Dr. A.K. Singh");
    expect(formatDoctorName("  rahul   o'neil-rao ")).toBe("Dr. Rahul O'Neil-Rao");
  });
  it("leaves mixed-case names alone and handles empty input", () => {
    expect(formatDoctorName("Dr Ravi van der Berg")).toBe("Dr Ravi van der Berg");
    expect(formatDoctorName("")).toBe("");
  });
});

describe("buildDoctorMeta", () => {
  it("generates title and description from the profile", () => {
    const m = buildDoctorMeta({ origin, profile });
    expect(m.title).toBe("Dr. Anita Sharma - Gynaecologist in Kota | Doctylia");
    expect(m.description).toContain("12+ years experience");
    expect(m.canonical).toBe("https://doctylia.com/dr/dr-anita-sharma");
  });

  it("ignores the shared placeholder hero text", () => {
    const m = buildDoctorMeta({ origin, profile, settings: { hero_description: "Compassionate, personalized and professional healthcare for a better tomorrow." } });
    expect(m.description).toContain("Book an appointment with Dr. Anita Sharma");
    expect(buildDoctorMeta({ origin, profile, settings: { hero_description: "Gentle care for kids." } }).description).toBe("Gentle care for kids.");
  });

  it("prefers the doctor's own SEO fields", () => {
    const m = buildDoctorMeta({ origin, profile, settings: { seo_title: " Custom ", seo_description: " Desc " } });
    expect(m.title).toBe("Custom");
    expect(m.description).toBe("Desc");
  });
});

describe("buildDoctorJsonLd", () => {
  it("includes postal code, locality and breadcrumbs through the directory", () => {
    const ld: any = buildDoctorJsonLd({ origin, profile, reviews: [{ rating: 5 }, { rating: 4 }], settings: { social_instagram: "https://instagram.com/x", social_facebook: "javascript:alert(1)" } });
    const [phys, crumbs] = ld["@graph"];
    expect(phys.address.postalCode).toBe("324005");
    expect(phys.address.streetAddress).toBe("12 Aerodrome Rd, Talwandi");
    expect(phys.aggregateRating.ratingValue).toBe("4.5");
    expect(phys.sameAs).toEqual(["https://instagram.com/x"]);
    expect(crumbs.itemListElement.map((c: any) => c.name)).toEqual(["Doctylia", "Doctors", "Kota", "Gynaecologist", "Dr. Anita Sharma"]);
  });

  it("returns null without a name", () => {
    expect(buildDoctorJsonLd({ origin, profile: { slug: "x" } })).toBeNull();
  });

  it("hub paths are null without a city", () => {
    expect(doctorHubPaths({ specialization: "ENT" }).specialtyPath).toBeNull();
  });
});

const template = `<!doctype html><html><head>
<title>Old</title>
<meta name="description" content="old" />
<meta name="google-site-verification" content="keep" />
<link rel="canonical" href="https://doctylia.com/" />
<meta property="og:title" content="old" />
<meta name="twitter:image" content="old" />
<script type="application/ld+json">{"old":true}</script>
</head><body><div id="root"></div></body></html>`;

describe("renderPage", () => {
  const html = renderPage(template, {
    title: 'Dr "A" <b> & Co',
    description: "d",
    canonical: "https://doctylia.com/dr/a",
    robots: INDEXABLE,
    jsonLd: [{ name: "</script><script>alert(1)</script>" }],
    bodyHtml: "<main>hi</main>",
  });

  it("replaces generic tags and keeps unrelated ones", () => {
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html).not.toContain("Old");
    expect(html).not.toContain('"old":true');
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
    expect(html).toContain('name="google-site-verification"');
  });

  it("escapes attributes and JSON-LD", () => {
    expect(html).toContain("<title>Dr &quot;A&quot; &lt;b&gt; &amp; Co</title>");
    expect(html).not.toContain("</script><script>alert(1)");
    expect(html).toContain("\\u003c/script>");
  });

  it("injects the body into #root", () => {
    expect(html).toContain('<div id="root"><main>hi</main></div>');
  });
});

describe("buildHubHead", () => {
  const base = { origin, citySlug: "kota", cityLabel: "Kota", facets: [], doctors: [{ slug: "a", full_name: "A", specialization: "ENT", city: "Kota" }] };
  it("noindexes thin city hubs and indexes healthy ones", () => {
    expect(buildHubHead({ ...base, total: 2 }).robots).toBe(NOINDEX);
    expect(buildHubHead({ ...base, total: 3 }).robots).toBe(INDEXABLE);
  });
  it("builds city+specialty titles and escapes labels in the body", () => {
    const h = buildHubHead({ ...base, specialtySlug: "ent", specialtyLabel: "ENT <x>", total: 5 });
    expect(h.title).toBe("ENT <x> doctors in Kota - Book Appointment Online | Doctylia");
    expect(h.bodyHtml).toContain("ENT &lt;x&gt; doctors in Kota");
    expect(h.canonical).toBe("https://doctylia.com/doctors/kota/ent");
  });
});
