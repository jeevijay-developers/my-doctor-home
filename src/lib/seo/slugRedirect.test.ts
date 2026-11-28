import { describe, it, expect, vi } from "vitest";
import { redirectForOldSlug, resolveOldSlug } from "./slugRedirect";

const up = { url: "https://x.supabase.co/", key: "anon" };
const okJson = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

describe("resolveOldSlug", () => {
  it("calls the RPC and returns the new slug", async () => {
    const f = okJson("new-slug");
    expect(await resolveOldSlug(up, "old-slug", f)).toBe("new-slug");
    const [url, init] = (f as any).mock.calls[0];
    expect(url).toBe("https://x.supabase.co/rest/v1/rpc/resolve_clinic_slug");
    expect(JSON.parse(init.body)).toEqual({ _slug: "old-slug" });
    expect(init.headers.apikey).toBe("anon");
  });
  it("returns null for unknown, same slug, HTTP errors and network errors", async () => {
    expect(await resolveOldSlug(up, "x", okJson(null))).toBeNull();
    expect(await resolveOldSlug(up, "x", okJson("x"))).toBeNull();
    expect(await resolveOldSlug(up, "x", vi.fn(async () => new Response("no", { status: 500 })) as unknown as typeof fetch)).toBeNull();
    expect(await resolveOldSlug(up, "x", vi.fn(async () => { throw new Error("down"); }) as unknown as typeof fetch)).toBeNull();
  });
});

describe("redirectForOldSlug", () => {
  it("301s keeping path suffix and query", () => {
    const r = redirectForOldSlug("https://doctylia.com/dr/old/blog/post-1?utm=a&b=2", "new")!;
    expect(r.status).toBe(301);
    expect(r.headers.get("Location")).toBe("https://doctylia.com/dr/new/blog/post-1?utm=a&b=2");
  });
  it("handles the bare clinic page and doctor pages", () => {
    expect(redirectForOldSlug("https://doctylia.com/dr/old", "new")!.headers.get("Location")).toBe("https://doctylia.com/dr/new");
    expect(redirectForOldSlug(new URL("https://doctylia.com/dr/old/doctor/dr-b"), "new")!.headers.get("Location")).toBe("https://doctylia.com/dr/new/doctor/dr-b");
  });
  it("returns null for other paths or when the slug is already current", () => {
    expect(redirectForOldSlug("https://doctylia.com/doctors", "new")).toBeNull();
    expect(redirectForOldSlug("https://doctylia.com/dr/new/blog", "new")).toBeNull();
  });
});
