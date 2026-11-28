import { describe, it, expect, afterEach, vi } from "vitest";
import { jsonReq, BASE_ENV } from "../_test/harness";
import { boot, stubFetch, bodyOf } from "../_test/payHelpers";

// Same harness as ai-blog-writer/index.test.ts. (The pure parsing/prompt/output logic is also covered by
// ../_shared/aiBio.test.ts, which runs in the normal vitest suite.)
vi.mock("https://deno.land/std@0.168.0/http/server.ts", () => ({
  serve: (h: any) => (globalThis as any).Deno.serve(h),
}));

const KEY = "AIza-fake-gemini-key";
const ENV = { ...BASE_ENV, GEMINI_API_KEY: KEY };
const authUser = (id: string | null) => ({ getUser: async () => ({ data: { user: id ? { id } : null }, error: null }) });
const setup = (env: any = ENV, rpc: any = {}, uid: string | null = "user-1") => boot("ai-bio-writer", env, { auth: authUser(uid), rpc });
const req = (b: any = { name: "Dr Asha", specialization: "Dermatologist", city: "Kota", experienceYears: 9 }) =>
  jsonReq(b, { headers: { Authorization: "Bearer tok" } });
const BIO = "Dr. Asha is a Dermatologist in Kota with 9+ years of experience. Patients can book an appointment online.";
const gemini = (text: string) => ({ body: { candidates: [{ content: { parts: [{ text }] } }] } });

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("ai-bio-writer", () => {
  it("OPTIONS preflight 200", async () => {
    const { handler } = await setup();
    expect((await handler(jsonReq(undefined, { method: "OPTIONS" }))).status).toBe(200);
  });

  it("401 when the JWT does not resolve to a user; Gemini not called", async () => {
    const calls = stubFetch(() => gemini(BIO));
    const { handler } = await setup(ENV, {}, null);
    expect((await handler(req())).status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("has no plan gate: a signed-in user on any plan gets a bio", async () => {
    stubFetch(() => gemini(BIO));
    const { handler, client } = await setup();
    const res = await handler(req());
    expect(res.status).toBe(200);
    expect(await bodyOf(res)).toEqual({ bio: BIO });
    expect(client.calls.find((c) => c.table === "rpc:doctor_has_feature")).toBeUndefined();
  });

  it("400 on a missing name and specialization, oversize or non-string input; Gemini not called", async () => {
    const calls = stubFetch(() => gemini(BIO));
    const { handler } = await setup();
    for (const body of [{ city: "Kota" }, { name: "x".repeat(200_000) }, { name: 5 }, { name: "A", optionalNotes: "x".repeat(301) }, { name: "A", services: "Acne" }]) {
      expect((await handler(req(body))).status).toBe(400);
    }
    expect(calls).toHaveLength(0);
  });

  it("500 when GEMINI_API_KEY is not configured", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const calls = stubFetch(() => gemini(BIO));
    const { handler } = await setup({ ...BASE_ENV });
    expect((await handler(req())).status).toBe(500);
    expect(calls).toHaveLength(0);
  });

  it("429 when the per-user rate limit (10 / hour) is exhausted; Gemini not called", async () => {
    const calls = stubFetch(() => gemini(BIO));
    const { handler, client } = await setup(ENV, { consume_rate_limit: false });
    expect((await handler(req())).status).toBe(429);
    expect(calls).toHaveLength(0);
    expect(client.calls.find((c) => c.table === "rpc:consume_rate_limit")!.args[0]).toMatchObject({ _key: "ai-bio-writer:user:user-1", _limit: 10, _window_seconds: 3600 });
  });

  it("sends the facts and the safety rules; the key travels in a header, not the URL", async () => {
    const calls = stubFetch(() => gemini(BIO));
    const { handler } = await setup();
    await handler(req());
    expect(calls[0].url).toContain("models/gemini-2.5-flash:generateContent");
    expect(calls[0].url).not.toContain(KEY);
    const prompt = calls[0].body.contents[0].parts[0].text;
    expect(prompt).toContain("Dermatologist");
    expect(prompt).toContain("Kota");
    expect(prompt).toContain("NEVER invent awards");
  });

  it("strips markdown from the model output", async () => {
    stubFetch(() => gemini("**" + BIO + "**"));
    const { handler } = await setup();
    expect(await bodyOf(await handler(req()))).toEqual({ bio: BIO });
  });

  it("empty model output -> 502; upstream bodies are never echoed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubFetch(() => gemini("   "));
    const { handler } = await setup();
    expect((await handler(req())).status).toBe(502);
  });

  it("upstream 429 is reported as 429 with a generic message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubFetch(() => ({ status: 429, body: { error: { message: "SECRET-UPSTREAM-DETAIL" } } }));
    const { handler } = await setup();
    const res = await handler(req());
    expect(res.status).toBe(429);
    expect(JSON.stringify(await res.json())).not.toContain("SECRET-UPSTREAM-DETAIL");
  }, 20000);
});
