import { describe, expect, it } from "vitest";
import { DIRECTORY_MIN_INDEXABLE } from "../directory/slug";
import {
  buildDoctorBody,
  buildHubHead,
  hubHeading,
  hubPath,
  isHubIndexable,
  type DirectoryDoctor,
  type HubContext,
} from "./directorySeo";
import { INDEXABLE, NOINDEX } from "./injectHead";

const origin = "https://doctylia.com";
const doc = (over: Partial<DirectoryDoctor> = {}): DirectoryDoctor => ({
  slug: "dr-a",
  full_name: "anita sharma",
  specialization: "Dentist",
  city: "Kota",
  ...over,
});
const ctx = (over: Partial<HubContext> = {}): HubContext => ({ origin, doctors: [], total: 0, facets: [], ...over });

describe("hubPath / hubHeading", () => {
  it("builds paths for each level", () => {
    expect(hubPath()).toBe("/doctors");
    expect(hubPath(undefined, "dentist")).toBe("/doctors"); // specialty without city has no hub
    expect(hubPath("kota")).toBe("/doctors/kota");
    expect(hubPath("kota", "dentist")).toBe("/doctors/kota/dentist");
  });
  it("builds headings", () => {
    expect(hubHeading()).toBe("Find a doctor");
    expect(hubHeading("Kota")).toBe("Doctors in Kota");
    expect(hubHeading("Kota", "Dentist")).toBe("Dentist doctors in Kota");
    expect(hubHeading(undefined, "Dentist")).toBe("Find a doctor");
  });
});

describe("isHubIndexable", () => {
  it("root hub needs at least one doctor", () => {
    expect(isHubIndexable(0)).toBe(false);
    expect(isHubIndexable(1)).toBe(true);
  });
  it("city/specialty hubs need DIRECTORY_MIN_INDEXABLE", () => {
    expect(isHubIndexable(DIRECTORY_MIN_INDEXABLE - 1, "kota")).toBe(false);
    expect(isHubIndexable(DIRECTORY_MIN_INDEXABLE, "kota")).toBe(true);
  });
});

describe("buildHubHead", () => {
  it("root hub", () => {
    const h = buildHubHead(ctx({ total: 5 }));
    expect(h.canonical).toBe("https://doctylia.com/doctors");
    expect(h.title).toMatch(/^Find a Doctor Near You/);
    expect(h.robots).toBe(INDEXABLE);
  });
  it("empty root hub is noindex", () => {
    expect(buildHubHead(ctx()).robots).toBe(NOINDEX);
  });
  it("city hub: pluralisation, thin-content noindex, canonical", () => {
    const one = buildHubHead(ctx({ citySlug: "kota", cityLabel: "Kota", total: 1, doctors: [doc()] }));
    expect(one.description).toContain("1 doctor in Kota");
    expect(one.description).not.toContain("1 doctors");
    expect(one.robots).toBe(NOINDEX);
    expect(one.canonical).toBe("https://doctylia.com/doctors/kota");
    const many = buildHubHead(ctx({ citySlug: "kota", cityLabel: "Kota", total: 3 }));
    expect(many.description).toContain("3 doctors in Kota");
    expect(many.robots).toBe(INDEXABLE);
  });
  it("specialty hub", () => {
    const h = buildHubHead(ctx({ citySlug: "kota", specialtySlug: "dentist", cityLabel: "Kota", specialtyLabel: "Dentist", total: 4 }));
    expect(h.title).toBe("Dentist doctors in Kota - Book Appointment Online | Doctylia");
    expect(h.canonical).toBe("https://doctylia.com/doctors/kota/dentist");
    expect(h.description).toContain("4 Dentist doctors in Kota");
    const crumbs = (h.jsonLd![0] as any)["@graph"][1].itemListElement;
    expect(crumbs.map((c: any) => c.name)).toEqual(["Doctylia", "Doctors", "Kota", "Dentist"]);
    expect(crumbs[3].item).toBe(h.canonical);
  });
  it("ItemList names doctors via formatDoctorName and uses doctors.length", () => {
    const h = buildHubHead(ctx({ total: 40, doctors: [doc(), doc({ slug: "b", full_name: null })] }));
    const list = (h.jsonLd![0] as any)["@graph"][0];
    expect(list.numberOfItems).toBe(2);
    expect(list.itemListElement[0]).toMatchObject({ position: 1, url: "https://doctylia.com/dr/dr-a", name: "Dr. Anita Sharma" });
    expect(list.itemListElement[1].name).toBe("");
  });
  it("body escapes doctor and facet data and encodes slugs", () => {
    const h = buildHubHead(
      ctx({
        citySlug: "kota",
        cityLabel: "Kota",
        total: 3,
        doctors: [doc({ slug: "a b", full_name: "x<script>", specialization: "<b>", locality: null, city: "K&K" })],
        facets: [
          { kind: "specialty", slug: "dentist", label: "Dent<ist>", doctor_count: "7" },
          { kind: "city", slug: "jaipur", label: "Jaipur", doctor_count: 2 },
        ],
      }),
    );
    expect(h.bodyHtml).not.toContain("<script>");
    expect(h.bodyHtml).toContain('href="/dr/a%20b"');
    expect(h.bodyHtml).toContain("&lt;b&gt;, K&amp;K");
    expect(h.bodyHtml).toContain('<a href="/doctors/kota/dentist">Dent&lt;ist&gt;</a> (7)');
    expect(h.bodyHtml).toContain('<a href="/doctors/jaipur">Jaipur</a> (2)');
  });
  it("specialty facets are not linked on the root hub (no city)", () => {
    const h = buildHubHead(ctx({ total: 3, facets: [{ kind: "specialty", slug: "dentist", label: "Dentist", doctor_count: 1 }] }));
    expect(h.bodyHtml).not.toContain("Dentist");
    expect(h.bodyHtml).not.toContain("<nav");
  });
  it("omits lists when empty", () => {
    expect(buildHubHead(ctx()).bodyHtml).toBe("<main><h1>Find a doctor</h1></main>");
  });
});

describe("buildDoctorBody", () => {
  const hubs = { cityPath: "/doctors/kota", cityName: "Kota", specialtyPath: "/doctors/kota/dentist", specialtyName: "Dentist" };
  it("renders breadcrumbs, heading, description, address and services", () => {
    const html = buildDoctorBody({ name: "Dr. A", description: "Desc", specialization: "Dentist", city: "Kota", address: "12 Rd", services: [{ name: "Scaling" }], hubs });
    expect(html).toContain('<a href="/doctors">Doctors</a> / <a href="/doctors/kota">Kota</a> / <a href="/doctors/kota/dentist">Dentist</a>');
    expect(html).toContain("<h1>Dr. A - Dentist</h1>");
    expect(html).toContain("<p>12 Rd, Kota</p>");
    expect(html).toContain("<li>Scaling</li>");
  });
  it("omits optional parts, caps services at 12 and escapes", () => {
    const services = Array.from({ length: 20 }, (_, i) => ({ name: `S<${i}>` }));
    const html = buildDoctorBody({
      name: "A<b>",
      description: "x & y",
      services,
      hubs: { cityPath: null, cityName: null, specialtyPath: null, specialtyName: null },
    });
    expect(html).not.toContain("<b>");
    expect(html).toContain("x &amp; y");
    expect(html.match(/<li>/g)).toHaveLength(12);
    expect(html).toContain('<nav aria-label="Breadcrumb"><a href="/doctors">Doctors</a></nav>');
    expect(html).not.toContain(" - ");
    const none = buildDoctorBody({ name: "A", description: "d", services: [], hubs: { cityPath: null, cityName: null, specialtyPath: null, specialtyName: null } });
    expect(none).not.toContain("Services");
  });
});

describe("practitioner rows", () => {
  it("link to the doctor's own page; clinic rows keep the clinic link", () => {
    const head = buildHubHead(ctx({
      total: 2,
      doctors: [doc({ slug: "dr-a", full_name: "Ravi Kumar", practitioner_slug: "ravi" }), doc({ slug: "dr-b", full_name: "solo doc" })],
    }));
    expect(head.bodyHtml).toContain('<a href="/dr/dr-a/doctor/ravi">Dr. Ravi Kumar</a>');
    expect(head.bodyHtml).toContain('<a href="/dr/dr-b">Dr. Solo Doc</a>');
    const items = (head.jsonLd[0] as any)["@graph"][0].itemListElement;
    expect(items[0].url).toBe("https://doctylia.com/dr/dr-a/doctor/ravi");
    expect(items[1].url).toBe("https://doctylia.com/dr/dr-b");
  });
});
