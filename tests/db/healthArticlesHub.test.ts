// The Health Articles hub RPCs: who is eligible, what leaks, who may hide a post.
import { admin, anonClient, as, errText, ids, MARK, must, purgeTestData, tracker, uniq } from "./helpers";

const t = tracker();
const anon = anonClient();
let A: string, B: string;
let origA: Record<string, unknown> = {};
const post = (doctorId: string, o: Record<string, unknown> = {}) =>
  admin.from("blog_posts").insert({
    doctor_id: doctorId, title: `${MARK} ${uniq("hub")}`, excerpt: "e", content: "<p>one two three</p>",
    category: "ZZT Heart", is_published: true, published_at: new Date().toISOString(), ...o,
  }).select().single().then((r) => { if (r.error) throw new Error(r.error.message); return t.add("blog_posts", r.data); });
// Throws on error so a failing RPC can never satisfy a negative ("not listed") assertion.
const hub = async (args: Record<string, unknown> = {}): Promise<any[]> => {
  const { data, error } = await anon.rpc("search_blog_posts", { p_query: null, p_category: null, p_limit: 48, p_offset: 0, ...args });
  if (error) throw new Error(`search_blog_posts: ${error.message}`);
  return data ?? [];
};
const hubIds = async (args: Record<string, unknown> = {}) => (await hub(args)).map((r) => r.id);
const slugOf = (category: string) => category.toLowerCase().replace(/[^a-z0-9]+/g, "-");

beforeAll(async () => {
  ({ doctorA: A, doctorB: B } = await ids());
  origA = (await admin.from("profiles").select("directory_listed,plan_status").eq("id", A).single()).data!;
});
afterAll(async () => {
  await admin.from("profiles").update(origA).eq("id", A);
  await t.cleanup();
  purgeTestData();
});

const CARD_KEYS = [
  "category", "doctor_city", "doctor_name", "doctor_photo_url", "doctor_slug", "doctor_specialization",
  "excerpt", "featured_image_url", "id", "published_at", "reading_minutes", "slug", "title",
  "total_count", "updated_at",
];

describe("search_blog_posts eligibility", () => {
  it("lists a published post with exactly the card-safe columns", async () => {
    const p = await post(B);
    const row = (await hub({ p_query: p.title })).find((r: any) => r.id === p.id);
    expect(row).toBeDefined();
    expect(row).toMatchObject({ doctor_slug: "dr-beta", title: p.title, reading_minutes: 1 });
    expect(Object.keys(row).sort()).toEqual(CARD_KEYS);
    for (const k of ["content", "email", "phone", "razorpay_account_id", "doctor_id"]) expect(row).not.toHaveProperty(k);
    expect(Object.keys(row).filter((k) => /email|phone|razorpay|content/i.test(k))).toEqual([]);
  });

  it("hides drafts and hub_hidden posts (positive baseline first)", async () => {
    const draft = await post(B, { is_published: false, published_at: null });
    const hidden = await post(B, { hub_hidden: true });
    const ok = await post(B);
    const ids1 = await hubIds({ p_query: MARK });
    expect(ids1).toContain(ok.id);
    expect(ids1).not.toContain(draft.id);
    expect(ids1).not.toContain(hidden.id);
  });

  it("hides posts of unlisted and cancelled doctors (positive baseline first)", async () => {
    const other = await post(A);
    expect(await hubIds({ p_query: MARK })).toContain(other.id);

    await must(admin.from("profiles").update({ directory_listed: false }).eq("id", A).select(), "unlist A");
    expect(await hubIds({ p_query: MARK })).not.toContain(other.id);

    await must(admin.from("profiles").update(origA).eq("id", A).select(), "restore A");
    expect(await hubIds({ p_query: MARK })).toContain(other.id);

    await must(admin.from("profiles").update({ plan_status: "cancelled" }).eq("id", A).select(), "cancel A");
    expect(await hubIds({ p_query: MARK })).not.toContain(other.id);

    await must(admin.from("profiles").update(origA).eq("id", A).select(), "restore A again");
    expect(await hubIds({ p_query: MARK })).toContain(other.id);
  });

  it("filters by category slug", async () => {
    const cat = `ZZT ${uniq("cat")}`;
    const mine = await post(B, { category: cat });
    await post(B, { category: "ZZT Other Cat" });
    const byCat = await hub({ p_category: slugOf(cat) });
    expect(byCat.map((r) => r.id)).toEqual([mine.id]);
    expect(Number(byCat[0].total_count)).toBe(1);
  });

  it("treats LIKE wildcards in the query literally", async () => {
    const pct = await post(B, { title: `${MARK} 100% plain` });
    const plain = await post(B, { title: `${MARK} 100 plain` });
    const under = await post(B, { title: `${MARK} zztXa under` });
    const underReal = await post(B, { title: `${MARK} zzt_a under` });

    const pctIds = await hubIds({ p_query: "100%" });
    expect(pctIds).toContain(pct.id);
    expect(pctIds).not.toContain(plain.id);

    // "%" alone must match only rows that literally contain a percent sign, not every row.
    const all = await hub({ p_query: null });
    expect(all.length).toBeGreaterThan(1);
    const lone = await hub({ p_query: "%" });
    expect(lone.length).toBeLessThan(all.length);
    expect(lone.map((r) => r.id)).toContain(pct.id);
    expect(lone.map((r) => r.id)).not.toContain(plain.id);
    expect(lone.every((r: any) => `${r.title}${r.excerpt}${r.category}${r.doctor_name}`.toLowerCase().includes("%"))).toBe(true);

    // "_" is not a single-character wildcard: zzt_a must not match zztXa.
    const underIds = await hubIds({ p_query: "zzt_a" });
    expect(underIds).toContain(underReal.id);
    expect(underIds).not.toContain(under.id);
  });

  it("caps an oversized free-text query instead of failing", async () => {
    expect(await hub({ p_query: "x".repeat(5000) })).toEqual([]);
  });
});

describe("search_blog_posts pagination", () => {
  it("orders by published_at DESC then id, pages exactly, clamps limit and handles past-the-end offset", async () => {
    const cat = `ZZT ${uniq("pagecat")}`;
    const slug = slugOf(cat);
    const base = Date.now();
    const at = (min: number) => new Date(base - min * 60_000).toISOString();
    // two posts share a timestamp to exercise the id tie-break
    const posts = [
      await post(B, { category: cat, published_at: at(1) }),
      await post(B, { category: cat, published_at: at(5) }),
      await post(B, { category: cat, published_at: at(5) }),
      await post(B, { category: cat, published_at: at(10) }),
      await post(B, { category: cat, published_at: at(20) }),
    ];
    const expected = [...posts]
      .sort((x, y) => (Date.parse(y.published_at) - Date.parse(x.published_at)) || (x.id < y.id ? -1 : 1))
      .map((x) => x.id);

    const all = await hub({ p_category: slug });
    expect(all.map((r) => r.id)).toEqual(expected);
    expect(all.every((r) => Number(r.total_count) === 5)).toBe(true);

    const p1 = await hub({ p_category: slug, p_limit: 2, p_offset: 0 });
    const p2 = await hub({ p_category: slug, p_limit: 2, p_offset: 2 });
    const p3 = await hub({ p_category: slug, p_limit: 2, p_offset: 4 });
    expect([...p1, ...p2, ...p3].map((r) => r.id)).toEqual(expected);
    expect([p1.length, p2.length, p3.length]).toEqual([2, 2, 1]);
    expect(p3.every((r) => Number(r.total_count) === 5)).toBe(true);

    expect(await hub({ p_category: slug, p_limit: 2, p_offset: 100 })).toEqual([]);
    expect(await hub({ p_category: slug, p_limit: 0 })).toHaveLength(1);
    expect(await hub({ p_category: slug, p_limit: -5 })).toHaveLength(1);
    expect(await hub({ p_category: slug, p_limit: 999 })).toHaveLength(5);
    expect((await hub({ p_limit: 999 })).length).toBeLessThanOrEqual(48);
    expect((await hub({ p_category: slug, p_limit: 2, p_offset: -3 })).map((r) => r.id)).toEqual(expected.slice(0, 2));
  });
});

describe("blog_facets", () => {
  it("returns slug, label and counts for eligible categories only", async () => {
    await post(B, { category: "ZZT Facet" });
    await post(B, { category: "ZZT Facet", hub_hidden: true });
    const { data, error } = await anon.rpc("blog_facets");
    if (error) throw new Error(error.message);
    const f = (data as any[]).find((x) => x.slug === "zzt-facet");
    expect(f).toMatchObject({ label: "ZZT Facet" });
    expect(Number(f.post_count)).toBe(1);
  });
});

describe("hub_hidden guard", () => {
  it("a doctor cannot hide or un-hide a post, but the owner can", async () => {
    const p = await post(B);
    const doctor = await as("doctorB");
    const denied = await doctor.from("blog_posts").update({ hub_hidden: true }).eq("id", p.id).select();
    expect(errText(denied.error)).toMatch(/HUB_HIDDEN_LOCKED|42501/);

    const owner = await as("owner");
    const ok = await owner.from("blog_posts").update({ hub_hidden: true }).eq("id", p.id).select().single();
    expect(ok.data?.hub_hidden).toBe(true);

    const undo = await doctor.from("blog_posts").update({ hub_hidden: false }).eq("id", p.id).select();
    expect(errText(undo.error)).toMatch(/HUB_HIDDEN_LOCKED|42501/);
    const still = await must(admin.from("blog_posts").select("hub_hidden").eq("id", p.id).single(), "reload");
    expect((still as any).hub_hidden).toBe(true);

    const unhide = await owner.from("blog_posts").update({ hub_hidden: false }).eq("id", p.id).select().single();
    expect(unhide.error).toBeNull();
    expect(unhide.data?.hub_hidden).toBe(false);
  });

  it("a doctor cannot INSERT a post that is already hub_hidden", async () => {
    const doctor = await as("doctorB");
    const r = await doctor.from("blog_posts").insert({
      doctor_id: B, title: `${MARK} ${uniq("ins")}`, content: "<p>x</p>", hub_hidden: true,
    }).select();
    if (r.data) for (const row of r.data) t.add("blog_posts", row as { id: string });
    expect(errText(r.error)).toMatch(/HUB_HIDDEN_LOCKED/);
  });

  it("a doctor can still edit other columns of a hidden post, even re-sending the unchanged hub_hidden:true", async () => {
    const p = await post(B, { hub_hidden: true });
    const doctor = await as("doctorB");
    const r = await doctor.from("blog_posts").update({ title: `${MARK} renamed` }).eq("id", p.id).select().single();
    expect(r.error).toBeNull();
    expect(r.data?.hub_hidden).toBe(true);
    // The BlogPage save sends the whole row back, including the unchanged flag.
    const full = await doctor.from("blog_posts").update({ title: `${MARK} renamed2`, hub_hidden: true }).eq("id", p.id).select().single();
    expect(full.error).toBeNull();
    expect(full.data).toMatchObject({ hub_hidden: true, title: `${MARK} renamed2` });
  });

  // Not covered: staff (the shared fixtures grant no blog.* permission) and a superadmin team member
  // with / without moderation.manage (teamLeads only has leads.view): no fixture exists for them.
});

describe("blog_posts_slug_format", () => {
  it("rejects a doctor setting an HTML-bearing or malformed slug", async () => {
    const p = await post(B);
    const doctor = await as("doctorB");
    const r = await doctor.from("blog_posts").update({ slug: 'x"><script>' }).eq("id", p.id).select();
    expect(r.error?.code).toBe("23514");
    const after = await must(admin.from("blog_posts").select("slug").eq("id", p.id).single(), "reload");
    expect((after as any).slug).toBe(p.slug);
    for (const bad of ["Has Caps", "-lead", "trail-", "dbl--dash", "a/b"]) {
      const x = await doctor.from("blog_posts").update({ slug: bad }).eq("id", p.id).select();
      expect(x.error?.code).toBe("23514");
    }
  });

  it("accepts a normal doctor-chosen slug and generates conforming slugs from awkward titles", async () => {
    const p = await post(B);
    const doctor = await as("doctorB");
    const good = await doctor.from("blog_posts").update({ slug: `zzt-ok-${uniq("s")}` }).eq("id", p.id).select().single();
    expect(good.error).toBeNull();

    // An empty slug is regenerated by the BEFORE trigger, which runs before the CHECK.
    const regen = await doctor.from("blog_posts").update({ slug: "" }).eq("id", p.id).select().single();
    expect(regen.error).toBeNull();
    expect(regen.data?.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);

    const re = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    const titles = [`${MARK} Hello, World! 100% <b>Heart</b>`, `${MARK} ${"very long title ".repeat(20)}`, "!!!", "ZZT dup", "ZZT dup"];
    for (const title of titles) {
      const r = await post(B, { title, slug: "" });
      expect(r.slug).toMatch(re);
      expect(r.slug.length).toBeLessThanOrEqual(90);
    }
  });
});
