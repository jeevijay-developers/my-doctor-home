import { describe, expect, it, vi } from "vitest";
import { proxySitemap } from "./proxySitemap";

const XML = `<?xml version="1.0" encoding="UTF-8"?><urlset></urlset>`;
const req = (qs = "") => new Request(`https://doctylia.com/api/sitemap${qs}`);

describe("proxySitemap", () => {
  it("returns the XML with an application/xml content type", async () => {
    const f = vi.fn(async () => new Response(XML, { headers: { "Content-Type": "text/plain" } })) as unknown as typeof fetch;
    const res = await proxySitemap(req(), "https://x.supabase.co/", f);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/xml; charset=utf-8");
    expect(await res.text()).toBe(XML);
    expect((f as any).mock.calls[0][0]).toBe("https://x.supabase.co/functions/v1/sitemap");
  });

  it("forwards the part parameter", async () => {
    const f = vi.fn(async () => new Response(XML)) as unknown as typeof fetch;
    await proxySitemap(req("?part=2"), "https://x.supabase.co", f);
    expect((f as any).mock.calls[0][0]).toBe("https://x.supabase.co/functions/v1/sitemap?part=2");
  });

  it("502s on upstream errors or non-XML bodies, and 503s without config", async () => {
    expect((await proxySitemap(req(), "https://x", (async () => new Response("boom", { status: 500 })) as typeof fetch)).status).toBe(502);
    expect((await proxySitemap(req(), "https://x", (async () => new Response("<html>")) as typeof fetch)).status).toBe(502);
    expect((await proxySitemap(req(), "https://x", (async () => { throw new Error("net"); }) as typeof fetch)).status).toBe(502);
    expect((await proxySitemap(req(), undefined)).status).toBe(503);
  });
});
