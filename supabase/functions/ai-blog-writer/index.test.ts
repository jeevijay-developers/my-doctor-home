import { describe, it, expect, afterEach, vi } from "vitest";
import { jsonReq, BASE_ENV } from "../_test/harness";
import { boot, stubFetch, bodyOf } from "../_test/payHelpers";

// ai-blog-writer imports `serve` from deno.land/std; route it to the stubbed Deno.serve.
vi.mock("https://deno.land/std@0.168.0/http/server.ts", () => ({
  serve: (h: any) => (globalThis as any).Deno.serve(h),
}));

const KEY = "AIza-fake-gemini-key";
const ENV = { ...BASE_ENV, GEMINI_API_KEY: KEY };
const authUser = (id: string | null) => ({ getUser: async () => ({ data: { user: id ? { id } : null }, error: null }) });
const setup = (env: any = ENV, rpc: any = { doctor_has_feature: true }, uid: string | null = "doc-1") =>
  boot("ai-blog-writer", env, { auth: authUser(uid), rpc });
const req = (b: any = { topic: "Diabetes diet", doctorName: "Dr Asha", specialization: "Endocrinology" }) =>
  jsonReq(b, { headers: { Authorization: "Bearer tok" } });
const gemini = (text: string) => ({ body: { candidates: [{ content: { parts: [{ text }] } }] } });
const article = { title: "T", excerpt: "E", content: "## Hi", category: "Nutrition" };

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("ai-blog-writer: gating", () => {
  it("OPTIONS preflight 200", async () => {
    const { handler } = await setup();
    expect((await handler(jsonReq(undefined, { method: "OPTIONS" }))).status).toBe(200);
  });

  it("401 when the JWT does not resolve to a user; Gemini not called", async () => {
    const calls = stubFetch(() => gemini("{}"));
    const { handler } = await setup(ENV, { doctor_has_feature: true }, null);
    expect((await handler(req())).status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("403 when the plan lacks ai_blog_writer; the feature check is for this doctor and key", async () => {
    const calls = stubFetch(() => gemini("{}"));
    const { handler, client } = await setup(ENV, { doctor_has_feature: false });
    expect((await handler(req())).status).toBe(403);
    expect(calls).toHaveLength(0);
    expect(client.calls.find((c) => c.table === "rpc:doctor_has_feature")!.args[0]).toEqual({ _doctor_id: "doc-1", _feature_key: "ai_blog_writer" });
  });

  it("500 when GEMINI_API_KEY is not configured", async () => {
    const calls = stubFetch(() => gemini("{}"));
    const { handler } = await setup({ ...BASE_ENV });
    expect((await handler(req())).status).toBe(500);
    expect(calls).toHaveLength(0);
  });

  it("429 when the per-doctor rate limit (20 / hour) is exhausted; Gemini not called", async () => {
    const calls = stubFetch(() => gemini("{}"));
    const { handler, client } = await setup(ENV, { doctor_has_feature: true, consume_rate_limit: false });
    expect((await handler(req())).status).toBe(429);
    expect(calls).toHaveLength(0);
    expect(client.calls.find((c) => c.table === "rpc:consume_rate_limit")!.args[0]).toMatchObject({ _key: "ai-blog-writer:doctor:doc-1", _limit: 20, _window_seconds: 3600 });
  });
});

describe("ai-blog-writer: generation", () => {
  it("returns the parsed article; calls gemini-2.5-flash with the topic and doctor details", async () => {
    const calls = stubFetch(() => gemini(JSON.stringify(article)));
    const { handler } = await setup();
    const res = await handler(req());
    expect(res.status).toBe(200);
    expect(await bodyOf(res)).toEqual(article);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("models/gemini-2.5-flash:generateContent");
    const prompt = calls[0].body.contents[0].parts[0].text;
    expect(prompt).toContain("Diabetes diet");
    expect(prompt).toContain("Dr Asha");
    expect(prompt).toContain("Endocrinology");
  });

  it("prompt asks for answer-first structure and forbids invented statistics", async () => {
    const calls = stubFetch(() => gemini(JSON.stringify(article)));
    const { handler } = await setup();
    await handler(req());
    const prompt = calls[0].body.contents[0].parts[0].text;
    expect(prompt).toContain("Never invent statistics");
    expect(prompt).toContain("40-60 word");
    expect(prompt).toContain("When to see a doctor");
    expect(prompt).toContain("500-800 words");
  });

  it("strips ```json fences the model adds", async () => {
    stubFetch(() => gemini("```json\n" + JSON.stringify(article) + "\n```"));
    const { handler } = await setup();
    expect(await bodyOf(await handler(req()))).toEqual(article);
  });

  it("non-JSON model output is wrapped as a General Health article titled with the topic", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubFetch(() => gemini("Just some prose"));
    const { handler } = await setup();
    expect(await bodyOf(await handler(req()))).toMatchObject({ title: "Diabetes diet", content: "Just some prose", category: "General Health" });
  });

  it("empty candidates -> 502", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubFetch(() => ({ body: { candidates: [] } }));
    const { handler } = await setup();
    expect((await handler(req())).status).toBe(502);
  });

  it("a 503 is retried once and then succeeds", async () => {
    let n = 0;
    const calls = stubFetch(() => (++n === 1 ? { status: 503, body: { error: { message: "busy" } } } : gemini(JSON.stringify(article))));
    const { handler } = await setup();
    const res = await handler(req());
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it("a 400 is not retried and falls through to the second model, then reports the error", async () => {
    const calls = stubFetch(() => ({ status: 400, body: { error: { message: "API key not valid" } } }));
    const { handler } = await setup();
    const res = await handler(req());
    expect(res.status).toBe(400);
    expect(calls.map((c) => c.url.includes("2.5-flash") ? "2.5" : "2.0")).toEqual(["2.5", "2.0"]);
  });
});

describe("ai-blog-writer: suspected bugs (M8)", () => {
  // BUG: M8a (ai-blog-writer/index.ts:256-261) on failure the response echoes the raw upstream body of every attempt
  // (`attempts: [...text]`) plus its message to the browser: provider internals, quota/billing details,
  // project ids. Callers should get a generic error; details belong in server logs.
  it.fails("M8a: upstream error bodies are not leaked to the client", async () => {
    stubFetch(() => ({ status: 403, body: { error: { message: "Project 123456789 billing disabled", details: "SECRET-UPSTREAM-DETAIL" } } }));
    const { handler } = await setup();
    const res = await handler(req());
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain("SECRET-UPSTREAM-DETAIL");
    expect(text).not.toContain("123456789");
  });

  // BUG: M8b (ai-blog-writer/index.ts:187,232-238) the Gemini API key is in the request URL (?key=...). If fetch throws
  // (Deno's error text is "error sending request for url (<full url>)") that message is copied into
  // `attempts` and returned to the caller -> any doctor on the plan can read the platform's GEMINI_API_KEY.
  it.fails("M8b: a network error never reveals the Gemini API key", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubFetch((url) => new Error(`error sending request for url (${url}): connection refused`));
    const { handler } = await setup();
    const res = await handler(req());
    expect(JSON.stringify(await res.json())).not.toContain(KEY);
  }, 20000);

  // BUG: M8c (ai-blog-writer/index.ts:149) topic / doctorName / specialization are interpolated into the prompt with no
  // type or length validation: a 200 KB topic is forwarded to Gemini (cost / quota abuse, prompt
  // injection through doctorName). Must be rejected with 400 before calling the model.
  it.fails("M8c: oversized or non-string input is rejected before calling Gemini", async () => {
    const calls = stubFetch(() => gemini(JSON.stringify(article)));
    const { handler } = await setup();
    const res = await handler(req({ topic: "x".repeat(200_000), doctorName: "Dr", specialization: "y" }));
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it.fails("M8c: a missing topic is rejected (400) rather than generating about \"undefined\"", async () => {
    const calls = stubFetch(() => gemini(JSON.stringify(article)));
    const { handler } = await setup();
    const res = await handler(req({ doctorName: "Dr" }));
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});
