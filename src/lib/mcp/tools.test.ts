import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const calls: { table: string; ops: [string, ...unknown[]][] }[] = [];
  let result: any = { data: [], error: null, count: 0 };
  const makeBuilder = (table: string) => {
    const rec = { table, ops: [] as [string, ...unknown[]][] };
    calls.push(rec);
    const b: any = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === "then") return (res: any, rej: any) => Promise.resolve(result).then(res, rej);
          return (...args: unknown[]) => {
            rec.ops.push([prop, ...args]);
            return b;
          };
        },
      },
    );
    return b;
  };
  return {
    calls,
    setResult: (r: any) => {
      result = r;
    },
    createClient: vi.fn(() => ({ from: (t: string) => makeBuilder(t) })),
  };
});

vi.mock("@supabase/supabase-js", () => ({ createClient: h.createClient }));
vi.mock("@lovable.dev/mcp-js", () => ({
  defineTool: (t: unknown) => t,
  defineMcp: (t: unknown) => t,
  auth: { oauth: { issuer: () => ({}) } },
}));

import getMyProfile from "./tools/get_my_profile";
import listAppointments from "./tools/list_appointments";
import listPatients from "./tools/list_patients";
import listReviews from "./tools/list_reviews";
import getDashboardStats from "./tools/get_dashboard_stats";

const ctx = (authed = true, uid = "doc-1") => ({
  isAuthenticated: () => authed,
  getUserId: () => uid,
  getToken: () => "jwt-token",
});
const run = (tool: any, input: any, c: any = ctx()) => tool.handler(input, c);
const ops = (i = 0) => h.calls[i].ops;
const has = (i: number, op: string, ...args: unknown[]) =>
  ops(i).some((o) => o[0] === op && args.every((a, k) => o[k + 1] === a));

beforeEach(() => {
  h.calls.length = 0;
  h.createClient.mockClear();
  h.setResult({ data: [], error: null, count: 0 });
  process.env.SUPABASE_URL = "https://x.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "anon";
});

describe("MCP tools: authentication", () => {
  it.each([
    ["get_my_profile", getMyProfile],
    ["list_appointments", listAppointments],
    ["list_patients", listPatients],
    ["list_reviews", listReviews],
    ["get_dashboard_stats", getDashboardStats],
  ])("%s refuses unauthenticated callers and touches no data", async (_n, tool) => {
    const r = await run(tool, {}, ctx(false));
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toBe("Not authenticated");
    expect(h.calls.length).toBe(0);
    expect(h.createClient).not.toHaveBeenCalled();
  });

  it("forwards the caller's own bearer token to the client (RLS acts as the doctor)", async () => {
    await run(listReviews, {});
    expect(h.createClient).toHaveBeenCalledWith(
      "https://x.supabase.co",
      "anon",
      expect.objectContaining({ global: { headers: { Authorization: "Bearer jwt-token" } } }),
    );
  });
});

describe("get_my_profile", () => {
  it("scopes to the caller's id", async () => {
    h.setResult({ data: { id: "doc-1", full_name: "A" }, error: null });
    const r = await run(getMyProfile, {}, ctx(true, "doc-1"));
    expect(has(0, "eq", "id", "doc-1")).toBe(true);
    expect(r.structuredContent.profile.id).toBe("doc-1");
  });
  it("reports missing profile and db errors as isError", async () => {
    h.setResult({ data: null, error: null });
    expect((await run(getMyProfile, {})).content[0].text).toMatch(/No profile found/);
    h.setResult({ data: null, error: { message: "boom" } });
    const r = await run(getMyProfile, {});
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toBe("boom");
  });
});

describe("list_appointments", () => {
  it("always filters by the caller's doctor_id and defaults the limit to 50", async () => {
    await run(listAppointments, {}, ctx(true, "doc-9"));
    expect(h.calls[0].table).toBe("appointments");
    expect(has(0, "eq", "doctor_id", "doc-9")).toBe(true);
    expect(has(0, "limit", 50)).toBe(true);
  });
  it("applies status and date filters", async () => {
    await run(listAppointments, { status: "pending", from_date: "2026-10-01", to_date: "2026-10-31", limit: 5 });
    expect(has(0, "eq", "status", "pending")).toBe(true);
    expect(has(0, "gte", "date", "2026-10-01")).toBe(true);
    expect(has(0, "lte", "date", "2026-10-31")).toBe(true);
    expect(has(0, "limit", 5)).toBe(true);
  });
  it("input schema caps limit at 200 and rejects bad statuses", () => {
    const s = (listAppointments as any).inputSchema;
    expect(s.limit.safeParse(201).success).toBe(false);
    expect(s.limit.safeParse(0).success).toBe(false);
    expect(s.limit.safeParse(200).success).toBe(true);
    expect(s.status.safeParse("deleted").success).toBe(false);
  });
  it("returns count and rows, and surfaces errors", async () => {
    h.setResult({ data: [{ id: 1 }, { id: 2 }], error: null });
    expect((await run(listAppointments, {})).structuredContent.count).toBe(2);
    h.setResult({ data: null, error: { message: "nope" } });
    expect((await run(listAppointments, {})).isError).toBe(true);
  });
});

describe("list_patients", () => {
  it("scopes to doctor and has no search filter by default", async () => {
    await run(listPatients, {}, ctx(true, "doc-2"));
    expect(has(0, "eq", "doctor_id", "doc-2")).toBe(true);
    expect(ops(0).some((o) => o[0] === "or")).toBe(false);
  });
  it("search is an or() filter applied after the doctor scope", async () => {
    await run(listPatients, { search: "ravi" });
    const o = ops(0).find((x) => x[0] === "or")!;
    expect(o[1]).toBe("name.ilike.%ravi%,phone.ilike.%ravi%");
    const names = ops(0).map((x) => x[0]);
    expect(names.indexOf("eq")).toBeLessThan(names.indexOf("or"));
  });
  it("sanitises filter-injection characters in search", async () => {
    await run(listPatients, { search: "a),doctor_id.neq.x,(b%_" });
    const clause = String(ops(0).find((x) => x[0] === "or")![1]);
    // only the two intended clauses remain: exactly one comma separates them
    expect(clause.split(",").length).toBe(2);
    expect(clause).not.toMatch(/[()]/);
  });
  it("skips or() when search sanitises to nothing", async () => {
    await run(listPatients, { search: "%_()," });
    expect(ops(0).some((x) => x[0] === "or")).toBe(false);
  });
});

describe("list_reviews", () => {
  it("scopes to doctor, filters by min rating, default limit", async () => {
    await run(listReviews, { min_rating: 4 }, ctx(true, "doc-3"));
    expect(has(0, "eq", "doctor_id", "doc-3")).toBe(true);
    expect(has(0, "gte", "rating", 4)).toBe(true);
    expect(has(0, "limit", 50)).toBe(true);
  });
  it("rating schema is bounded 1..5", () => {
    const s = (listReviews as any).inputSchema.min_rating;
    expect(s.safeParse(0).success).toBe(false);
    expect(s.safeParse(6).success).toBe(false);
    expect(s.safeParse(5).success).toBe(true);
  });
});

describe("get_dashboard_stats", () => {
  it("scopes every count query to the caller's doctor_id", async () => {
    await run(getDashboardStats, {}, ctx(true, "doc-4"));
    expect(h.calls.length).toBe(4);
    for (let i = 0; i < 4; i++) expect(has(i, "eq", "doctor_id", "doc-4")).toBe(true);
    expect(h.calls.map((c) => c.table)).toEqual(["patients", "appointments", "appointments", "appointments"]);
  });
  it("returns zeros for null counts and includes a date", async () => {
    h.setResult({ data: null, error: null, count: null });
    const r = await run(getDashboardStats, {});
    expect(r.structuredContent).toMatchObject({
      total_patients: 0,
      total_appointments: 0,
      appointments_today: 0,
      pending_appointments: 0,
    });
    expect(r.structuredContent.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("filters pending by status and today by date", async () => {
    await run(getDashboardStats, {});
    expect(has(3, "eq", "status", "pending")).toBe(true);
    expect(ops(2).some((o) => o[0] === "eq" && o[1] === "date")).toBe(true);
  });
  it("uses the IST calendar day for 'today'", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-31T20:00:00Z")); // 01:30 IST on 1 Nov
    try {
      const r = await run(getDashboardStats, {});
      expect(r.structuredContent.date).toBe("2026-11-01");
    } finally {
      vi.useRealTimers();
    }
  });
});
