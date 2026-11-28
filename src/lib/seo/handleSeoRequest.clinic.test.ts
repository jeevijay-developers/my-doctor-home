import { describe, expect, it, vi } from "vitest";

// Team-clinic crawler pages, thin-content guard and old-slug 301s on the edge.
const TEMPLATE = `<html><head><title>Generic</title></head><body><div id="root"></div></body></html>`;
const env = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon" };

type Route = (url: URL, init?: RequestInit) => unknown;
function fakeFetch(routes: Record<string, Route>) {
  return vi.fn(async (input: any, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === "/index.html") return new Response(TEMPLATE);
    const key = Object.keys(routes).find((k) => url.pathname.endsWith(k));
    if (!key) return new Response("[]");
    const out = routes[key](url, init);
    if (out instanceof Response) return out;
    return new Response(JSON.stringify(out));
  }) as unknown as typeof fetch;
}
const req = (qs: string) => new Request(`https://doctylia.com/api/seo?${qs}`);
async function run(qs: string, routes: Record<string, Route>) {
  vi.resetModules();
  const handler = (await import("./handleSeoRequest")).handleSeoRequest;
  return handler(req(qs), env, fakeFetch(routes));
}

const profile = { id: "d1", slug: "sharma-clinic", full_name: "Anita Sharma", clinic_name: "Sharma Clinic", specialization: "Dentist", city: "Kota", address: "12 Gandhi Marg", phone: "9876543210", profile_photo_url: "https://cdn.example.com/owner.jpg", plan_status: "active" };
const BIO = "Ravi treats children and adults with braces and aligners and has done so for ten years.";
const pA = { id: "p1", slug: "anita", display_name: "Anita Sharma", specialization: "Dentist", bio: BIO, is_active: true, directory_listed: true, consultation_fee: 500 };
const pB = { id: "p2", slug: "ravi", display_name: "Ravi Kumar", specialization: "ENT", bio: BIO, is_active: true, directory_listed: true, consultation_fee: 800 };
const team = [pA, pB];
const hours = [
  { practitioner_id: "p1", day_of_week: 1, is_open: true, start_time: "09:00:00", end_time: "13:00:00", start_time_2: null, end_time_2: null },
  { practitioner_id: "p2", day_of_week: 2, is_open: true, start_time: "10:00:00", end_time: "12:00:00", start_time_2: null, end_time_2: null },
  { practitioner_id: "gone", day_of_week: 3, is_open: true, start_time: "10:00:00", end_time: "12:00:00", start_time_2: null, end_time_2: null },
];
const clinicRoutes = (extra: Record<string, Route> = {}): Record<string, Route> => ({
  "/profiles": () => [profile],
  "/get_public_practitioners": () => team,
  "/services": () => [{ id: "s1", name: "Braces", price: 4000 }, { id: "s2", name: "Ear wash", price: 300 }],
  "/working_hours": () => hours,
  "/website_settings": () => [{ hero_photo_url: "https://cdn.example.com/hero.jpg" }],
  ...extra,
});
const meta = (html: string, re: RegExp) => html.match(re)?.[1];

describe("clinic page (kind=doctor) for a team clinic", () => {
  it("serves clinic title, description, og:type website, hero og:image and the doctors as links", async () => {
    const res = await run("kind=doctor&slug=sharma-clinic", clinicRoutes());
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain("<title>Sharma Clinic - Dentist, ENT in Kota | Doctylia</title>");
    expect(meta(html, /<meta name="description" content="([^"]*)"/)).toContain("Sharma Clinic in Kota has 2 doctors");
    expect(html).toContain('<meta property="og:type" content="website" />');
    expect(html).toContain('<meta property="og:image" content="https://cdn.example.com/hero.jpg" />');
    expect(html).toContain('<a href="/dr/sharma-clinic/doctor/anita">Dr. Anita Sharma</a>');
    expect(html).toContain('<a href="/dr/sharma-clinic/doctor/ravi">Dr. Ravi Kumar</a>');
    expect(html).toContain("Ear wash");
    expect(html).toContain("Monday: 9:00 AM - 1:00 PM");
    expect(html).toContain("Address: 12 Gandhi Marg, Kota");
    expect(html).toContain('"@type":["MedicalClinic","MedicalBusiness"]');
    expect(html).toContain('"openingHoursSpecification"');
    // hours of a doctor who is no longer in the team do not leak in
    expect(html).not.toContain("Wednesday");
    expect(html).toContain('<meta name="robots" content="index, follow');
  });

  it("uses the first gallery photo for og:image when there is no hero photo", async () => {
    const html = await (await run("kind=doctor&slug=sharma-clinic", clinicRoutes({
      "/website_settings": () => [{}],
      "/gallery_photos": () => [{ photo_url: "https://cdn.example.com/g1.jpg" }],
    }))).text();
    expect(html).toContain('<meta property="og:image" content="https://cdn.example.com/g1.jpg" />');
  });

  it("falls back to the owner's photo when the clinic has no picture at all, and ignores a non-https gallery url", async () => {
    const html = await (await run("kind=doctor&slug=sharma-clinic", clinicRoutes({
      "/website_settings": () => [{}],
      "/gallery_photos": () => [{ photo_url: "http://insecure.example.com/g.jpg" }],
    }))).text();
    expect(html).toContain('content="https://cdn.example.com/owner.jpg"');
  });

  it("still renders the team page when the hours and gallery lookups fail", async () => {
    const html = await (await run("kind=doctor&slug=sharma-clinic", clinicRoutes({
      "/working_hours": () => new Response("boom", { status: 500 }),
      "/gallery_photos": () => new Response("boom", { status: 500 }),
    }))).text();
    expect(html).toContain("<title>Sharma Clinic - Dentist, ENT in Kota | Doctylia</title>");
    expect(html).not.toContain("openingHoursSpecification");
  });

  it("clinic without clinic_name uses the owner's name once", async () => {
    const html = await (await run("kind=doctor&slug=sharma-clinic", clinicRoutes({ "/profiles": () => [{ ...profile, clinic_name: null }] }))).text();
    expect(html).toContain("<title>Dr. Anita Sharma - Dentist, ENT in Kota | Doctylia</title>");
    expect(html).not.toContain("Dr. Dr.");
  });

  it("2 active doctors but one unlisted: still the team layout, the unlisted doctor is not advertised", async () => {
    const html = await (await run("kind=doctor&slug=sharma-clinic", clinicRoutes({ "/get_public_practitioners": () => [pA, { ...pB, directory_listed: false }] }))).text();
    expect(html).toContain("Sharma Clinic - Dentist, ENT in Kota");
    expect(html).toContain("/dr/sharma-clinic/doctor/anita");
    expect(html).not.toContain("/dr/sharma-clinic/doctor/ravi");
  });

  it("one doctor deactivated: the single-doctor layout, with no extra lookups", async () => {
    const calls: string[] = [];
    const html = await (await run("kind=doctor&slug=sharma-clinic", clinicRoutes({
      "/get_public_practitioners": () => [pA, { ...pB, is_active: false }],
      "/working_hours": (u) => { calls.push(u.pathname); return hours; },
      "/gallery_photos": (u) => { calls.push(u.pathname); return []; },
    }))).text();
    expect(html).toContain('"@type":["Physician","MedicalBusiness"]');
    expect(html).toContain('<meta property="og:type" content="profile" />');
    expect(html).not.toContain("MedicalClinic");
    expect(calls).toEqual([]);
  });

  it("hostile clinic and doctor names stay inert in head, JSON-LD and body", async () => {
    const html = await (await run("kind=doctor&slug=sharma-clinic", clinicRoutes({
      "/profiles": () => [{ ...profile, clinic_name: `</script><img src=x onerror=alert(1)> & "Co"` }],
      "/get_public_practitioners": () => [{ ...pA, display_name: "<b>Evil</b>", bio: "<script>alert(2)</script> and a long enough bio to be listed here" }, pB],
    }))).text();
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>alert");
    expect(html.match(/<script/g)?.length ?? 0).toBe(1);
    expect(html).not.toMatch(/<b>Evil/);
  });
});

describe("per-doctor page: thin-content guard, body and image", () => {
  const go = (routes: Record<string, Route>, doctor = "ravi") => run(`kind=practitioner&slug=sharma-clinic&doctor=${doctor}`, clinicRoutes(routes));

  it("is indexable with a real bio (60+ chars)", async () => {
    const html = await (await go({})).text();
    expect(html).toContain('<meta name="robots" content="index, follow');
  });
  it("is noindex,follow (still 200) with an empty, null or short bio", async () => {
    for (const bio of ["", null, "Short bio.", "x".repeat(59)]) {
      const res = await go({ "/get_public_practitioners": () => [pA, { ...pB, bio }] });
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('<meta name="robots" content="noindex, follow"');
    }
  });
  it("is indexable at exactly 60 characters", async () => {
    const html = await (await go({ "/get_public_practitioners": () => [pA, { ...pB, bio: "x".repeat(60) }] })).text();
    expect(html).toContain('<meta name="robots" content="index, follow');
  });
  it("directory_listed=false stays noindex even with a long bio", async () => {
    const html = await (await go({ "/get_public_practitioners": () => [pA, { ...pB, directory_listed: false }] })).text();
    expect(html).toContain('<meta name="robots" content="noindex, follow"');
  });
  it("body: clinic breadcrumb, full bio, fee, address, phone, own hours only", async () => {
    const html = await (await go({})).text();
    expect(html).toContain('<a href="/dr/sharma-clinic">Sharma Clinic</a> / Dr. Ravi Kumar');
    expect(html).toContain(`<p>${BIO}</p>`);
    expect(html).toContain("Consultation fee: &#8377;800");
    expect(html).toContain("Address: 12 Gandhi Marg");
    expect(html).toContain("Phone: 9876543210");
    expect(html).toContain("Tuesday: 10:00 AM - 12:00 PM");
    expect(html).not.toContain("Monday: 9:00 AM");
  });
  it("lists only the services this doctor offers (service_practitioners)", async () => {
    const offered = [{ service_id: "s1", practitioner_id: "p1" }];
    const ravi = await (await go({ "/get_public_service_practitioners": () => offered })).text();
    expect(ravi).not.toContain("Braces");
    expect(ravi).toContain("Ear wash");
    const anita = await (await go({ "/get_public_service_practitioners": () => offered }, "anita")).text();
    expect(anita).toContain("Braces");
  });
  it("shows every service when the service lookup fails", async () => {
    const html = await (await go({ "/get_public_service_practitioners": () => new Response("x", { status: 500 }) })).text();
    expect(html).toContain("Braces");
    expect(html).toContain("Ear wash");
  });
  it("image falls back to the clinic's picture, never the owner's portrait", async () => {
    const html = await (await go({})).text();
    expect(html).toContain('<meta property="og:image" content="https://cdn.example.com/hero.jpg" />');
    expect(html).not.toContain("owner.jpg");
  });
  it("JSON-LD carries the clinic name on worksFor and the breadcrumb", async () => {
    const html = await (await go({})).text();
    expect(html).toContain('"worksFor":{"@type":"MedicalClinic","@id":"https://doctylia.com/dr/sharma-clinic#clinic","name":"Sharma Clinic"');
    expect(html).toContain('"name":"Sharma Clinic","item":"https://doctylia.com/dr/sharma-clinic"');
  });
  it("a deactivated doctor 301s to the clinic, and so does the last remaining one", async () => {
    const gone = await go({ "/get_public_practitioners": () => [pA, { ...pB, is_active: false }] });
    expect(gone.status).toBe(301);
    expect(gone.headers.get("Location")).toBe("https://doctylia.com/dr/sharma-clinic");
  });
});

describe("old clinic slug 301s on the edge (keeps the path suffix and the query)", () => {
  const moved = (extra: Record<string, Route> = {}): Record<string, Route> => ({
    "/profiles": () => [],
    "/resolve_clinic_slug": (_u, init) => (JSON.parse(String(init?.body)) as { _slug: string })._slug === "old-slug" ? "sharma-clinic" : null,
    ...extra,
  });

  it("clinic root keeps the visitor's query", async () => {
    const res = await run("kind=doctor&slug=old-slug&utm_source=qr&ref=poster", moved());
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("https://doctylia.com/dr/sharma-clinic?utm_source=qr&ref=poster");
    expect(res.headers.get("Cache-Control")).toContain("s-maxage");
  });
  it("clinic root without a query", async () => {
    const res = await run("kind=doctor&slug=old-slug", moved());
    expect(res.headers.get("Location")).toBe("https://doctylia.com/dr/sharma-clinic");
  });
  it("doctor page keeps /doctor/<slug>", async () => {
    const res = await run("kind=practitioner&slug=old-slug&doctor=ravi&utm=1", moved());
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("https://doctylia.com/dr/sharma-clinic/doctor/ravi?utm=1");
  });
  it("blog index and post keep /blog and /blog/<post>", async () => {
    const blog = await run("kind=blog&slug=old-slug", moved());
    expect(blog.status).toBe(301);
    expect(blog.headers.get("Location")).toBe("https://doctylia.com/dr/sharma-clinic/blog");
    const post = await run("kind=post&slug=old-slug&post=my%20post&x=1", moved());
    expect(post.status).toBe(301);
    expect(post.headers.get("Location")).toBe("https://doctylia.com/dr/sharma-clinic/blog/my%20post?x=1");
  });
  it("a slug nobody ever owned is a real 404 (noindex)", async () => {
    for (const qs of ["kind=doctor&slug=nobody", "kind=practitioner&slug=nobody&doctor=x", "kind=blog&slug=nobody", "kind=post&slug=nobody&post=p"]) {
      const res = await run(qs, moved());
      expect(res.status).toBe(404);
      expect(await res.text()).toContain("noindex, nofollow");
    }
  });
  it("the resolver echoing the same slug is not a redirect (no loop)", async () => {
    const res = await run("kind=doctor&slug=old-slug", moved({ "/resolve_clinic_slug": () => "old-slug" }));
    expect(res.status).toBe(404);
  });
});
