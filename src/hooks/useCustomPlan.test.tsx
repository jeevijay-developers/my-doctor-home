import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useCustomPlan } from "./useCustomPlan";

const m = vi.hoisted(() => ({
  from: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
  profile: { id: "doc-1" } as any,
  isStaff: false,
  planRow: null as any,
  requests: [] as any[],
  planError: null as any,
  tables: [] as string[],
  eqs: [] as [string, string][],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: m.from, channel: m.channel, removeChannel: m.removeChannel },
}));
vi.mock("./useProfile", () => ({ useProfile: () => ({ profile: m.profile, isStaff: m.isStaff }) }));

const plan = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  doctor_id: "doc-1",
  status: "active",
  base_tier: "pro",
  valid_from: "2020-01-01T00:00:00Z",
  valid_until: null,
  ...over,
});

describe("useCustomPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.profile = { id: "doc-1" };
    m.isStaff = false;
    m.planRow = null;
    m.requests = [];
    m.planError = null;
    m.tables = [];
    m.eqs = [];
    m.from.mockImplementation((table: string) => {
      m.tables.push(table);
      const result = () =>
        table === "doctor_custom_plans"
          ? { data: m.planRow, error: m.planError }
          : { data: m.requests, error: null };
      const b: any = {
        select: () => b,
        eq: (c: string, v: string) => {
          m.eqs.push([c, v]);
          return b;
        },
        order: () => b,
        limit: () => Promise.resolve(result()),
        maybeSingle: () => Promise.resolve(result()),
      };
      return b;
    });
    const ch: any = { on: vi.fn(() => ch), subscribe: vi.fn(() => ch) };
    m.channel.mockReturnValue(ch);
  });
  afterEach(() => vi.useRealTimers());

  it("returns an in-window active plan, scoped to the doctor", async () => {
    m.planRow = plan();
    const { result } = renderHook(() => useCustomPlan());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.customPlan?.id).toBe("p1");
    expect(m.eqs.every(([c, v]) => c === "doctor_id" && v === "doc-1")).toBe(true);
  });

  it("ignores cancelled, expired and not-yet-started plans", async () => {
    for (const p of [
      plan({ status: "cancelled" }),
      plan({ valid_until: "2020-06-01T00:00:00Z" }),
      plan({ valid_from: "2999-01-01T00:00:00Z" }),
    ]) {
      m.planRow = p;
      const { result, unmount } = renderHook(() => useCustomPlan());
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.customPlan).toBeNull();
      unmount();
    }
  });

  it("keeps the previously known plan when a refetch errors", async () => {
    m.planRow = plan();
    const { result } = renderHook(() => useCustomPlan());
    await waitFor(() => expect(result.current.customPlan).not.toBeNull());
    m.planRow = null;
    m.planError = { message: "net" };
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.customPlan).not.toBeNull();
  });

  it("splits requests into pending and latest decided", async () => {
    m.requests = [
      { id: "r3", status: "pending" },
      { id: "r2", status: "rejected" },
      { id: "r1", status: "approved" },
    ];
    const { result } = renderHook(() => useCustomPlan());
    await waitFor(() => expect(result.current.requests.length).toBe(3));
    expect(result.current.pendingRequest?.id).toBe("r3");
    expect(result.current.latestDecided?.id).toBe("r2");
  });

  it("does not read plan_requests for staff (they never see requests)", async () => {
    m.isStaff = true;
    m.planRow = plan();
    const { result } = renderHook(() => useCustomPlan());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(m.tables).not.toContain("plan_requests");
    expect(result.current.requests).toEqual([]);
  });

  it("does nothing without a profile", () => {
    m.profile = null;
    renderHook(() => useCustomPlan());
    expect(m.from).not.toHaveBeenCalled();
    expect(m.channel).not.toHaveBeenCalled();
  });

  it("flips to inactive on its own when valid_until passes while the page is open", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(new Date("2026-10-31T12:00:00Z"));
    m.planRow = plan({ valid_until: "2026-10-31T12:00:10Z" });
    const { result } = renderHook(() => useCustomPlan());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.customPlan).not.toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(11_000);
      await Promise.resolve();
    });
    expect(result.current.customPlan).toBeNull();
  });

  it("subscribes to this doctor's plan, request and social marketing rows and unsubscribes on unmount", async () => {
    const { unmount } = renderHook(() => useCustomPlan());
    await waitFor(() => expect(m.channel).toHaveBeenCalled());
    const ch = m.channel.mock.results[0].value;
    expect(ch.on.mock.calls.map((c: any[]) => c[1].table)).toEqual(["doctor_custom_plans", "plan_requests", "custom_plan_social_marketing"]);
    expect(ch.on.mock.calls.map((c: any[]) => c[1].filter)).toEqual(["doctor_id=eq.doc-1", "doctor_id=eq.doc-1", "doctor_id=eq.doc-1"]);
    unmount();
    expect(m.removeChannel).toHaveBeenCalled();
  });
});
