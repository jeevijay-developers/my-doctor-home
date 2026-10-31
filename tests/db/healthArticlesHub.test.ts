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
const hub = async (args: Record<string, unknown> = {}) =>
  (await anon.rpc("search_blog_posts", { p_query: null, p_category: null, p_limit: 48, p_offset: 0, ...args })).data ?? [];

beforeAll(async () => {
  ({ doctorA: A, doctorB: B } = await ids());
  origA = (await admin.from("profiles").select("directory_listed,plan_status").eq("id", A).single()).data!;
});
afterAll(async () => {
  await admin.from("profiles").update(origA).eq("id", A);
  await t.cleanup();
  purgeTestData();
});

describe("search_blog_posts eligibility", () => {
  it("lists a published post with card-safe columns and no content/private fields", async () => {
    const p = await post(B);
    const row = (await hub({ p_query: p.title })).find((r: any) => r.id === p.id);
    expect(row).toMatchObject({ doctor_slug: "dr-beta", title: p.title, reading_minutes: 1 });
    expect(Object.keys(row)).not.toEqual(expect.arrayContaining(["content"]));
    expect(Object.keys(row)).not.toEqual(expect.arrayContaining(["razorpay_account_id", "phone"]));
  });

  it("hides drafts, hub_hidden posts, unlisted doctors and cancelled doctors", async () => {
    const draft = await post(B, { is_published: false, published_at: null });
    const hidden = await post(B, { hub_hidden: true });
    const ok = await post(B);
    const other = await post(A);
    const ids1 = (await hub({ p_query: MARK })).map((r: any) => r.id);
    expect(ids1).toContain(ok.id);
    expect(ids1).not.toContain(draft.id);
    expect(ids1).not.toContain(hidden.id);

    await admin.from("profiles").update({ directory_listed: false }).eq("id", A);
    expect((await hub({ p_query: MARK })).map((r: any) => r.id)).not.toContain(other.id);
    await admin.from("profiles").update({ directory_listed: true, plan_status: "cancelled" }).eq("id", A);
    expect((await hub({ p_query: MARK })).map((r: any) => r.id)).not.toContain(other.id);
  });

  it("filters by category slug, paginates, and reports total_count", async () => {
    await admin.from("profiles").update(origA).eq("id", A);
    await post(B, { category: "ZZT Skin Care" });
    const byCat = await hub({ p_category: "zzt-skin-care" });
    expect(byCat.length).toBeGreaterThan(0);
    expect(byCat.every((r: any) => r.category === "ZZT Skin Care")).toBe(true);
    const page1 = await hub({ p_limit: 1, p_offset: 0 });
    const page2 = await hub({ p_limit: 1, p_offset: 1 });
    expect(page1).toHaveLength(1);
    expect(page2[0].id).not.toBe(page1[0].id);
    expect(Number(page1[0].total_count)).toBeGreaterThan(1);
  });

  it("treats LIKE wildcards in the query literally", async () => {
    await post(B, { title: `${MARK} 100% plain` });
    expect((await hub({ p_query: "%" })).every((r: any) => `${r.title}${r.excerpt}${r.category}${r.doctor_name}`.toLowerCase().includes("%"))).toBe(true);
  });
});

describe("blog_facets", () => {
  it("returns slug, label and counts for eligible categories only", async () => {
    await post(B, { category: "ZZT Facet" });
    await post(B, { category: "ZZT Facet", hub_hidden: true });
    const { data } = await anon.rpc("blog_facets");
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
  });

  it("a doctor can still edit other columns of a hidden post", async () => {
    const p = await post(B, { hub_hidden: true });
    const doctor = await as("doctorB");
    const r = await doctor.from("blog_posts").update({ title: `${MARK} renamed` }).eq("id", p.id).select().single();
    expect(r.error).toBeNull();
    expect(r.data?.hub_hidden).toBe(true);
  });
});
