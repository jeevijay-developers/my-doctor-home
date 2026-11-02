import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useFeatureAccess } from "./useFeatureAccess";

const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
  profile: { id: "doc-1", plan_tier: "pro" } as any,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: m.rpc, channel: m.channel, removeChannel: m.removeChannel },
}));
vi.mock("./useProfile", () => ({ useProfile: () => ({ profile: m.profile }) }));

const rows = [
  { feature_key: "blog", effective_enabled: true, source: "plan" },
  { feature_key: "video", effective_enabled: false, source: "override" },
];

describe("useFeatureAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.profile = { id: "doc-1", plan_tier: "pro" };
    const ch: any = { on: vi.fn(() => ch), subscribe: vi.fn(() => ch) };
    m.channel.mockReturnValue(ch);
  });

  it("asks the RPC for the profile's doctor only", async () => {
    m.rpc.mockResolvedValue({ data: rows, error: null });
    const { result } = renderHook(() => useFeatureAccess());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(m.rpc).toHaveBeenCalledWith("get_doctor_feature_access", { _doctor_id: "doc-1" });
  });

  it("hasFeature reflects effective_enabled; unknown keys are off", async () => {
    m.rpc.mockResolvedValue({ data: rows, error: null });
    const { result } = renderHook(() => useFeatureAccess());
    await waitFor(() => expect(result.current.rows.length).toBe(2));
    expect(result.current.hasFeature("blog" as any)).toBe(true);
    expect(result.current.hasFeature("video" as any)).toBe(false);
    expect(result.current.hasFeature("nonexistent" as any)).toBe(false);
    expect(result.current.sourceOf("video" as any)).toBe("override");
  });

  it("keeps previously known rows on a transient RPC error instead of locking everything", async () => {
    m.rpc.mockResolvedValueOnce({ data: rows, error: null });
    const { result } = renderHook(() => useFeatureAccess());
    await waitFor(() => expect(result.current.rows.length).toBe(2));
    m.rpc.mockResolvedValueOnce({ data: null, error: { message: "network" } });
    await result.current.refetch();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasFeature("blog" as any)).toBe(true);
  });

  it("does not call the RPC without a profile and stops loading", async () => {
    m.profile = null;
    const { result } = renderHook(() => useFeatureAccess());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(m.rpc).not.toHaveBeenCalled();
    expect(m.channel).not.toHaveBeenCalled();
  });

  it("drops stale out-of-order responses (newest request wins)", async () => {
    let resolveFirst!: (v: unknown) => void;
    m.rpc.mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)));
    m.rpc.mockResolvedValueOnce({ data: [{ feature_key: "blog", effective_enabled: true }], error: null });
    const { result } = renderHook(() => useFeatureAccess());
    await result.current.refetch();
    await waitFor(() => expect(result.current.hasFeature("blog" as any)).toBe(true));
    resolveFirst({ data: [{ feature_key: "blog", effective_enabled: false }], error: null });
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.hasFeature("blog" as any)).toBe(true);
  });

  it("subscribes to overrides and custom plans for this doctor and unsubscribes on unmount", async () => {
    m.rpc.mockResolvedValue({ data: rows, error: null });
    const { unmount } = renderHook(() => useFeatureAccess());
    await waitFor(() => expect(m.channel).toHaveBeenCalled());
    const ch = m.channel.mock.results[0].value;
    const filters = ch.on.mock.calls.map((c: any[]) => c[1].filter);
    expect(filters).toEqual(["doctor_id=eq.doc-1", "doctor_id=eq.doc-1"]);
    unmount();
    expect(m.removeChannel).toHaveBeenCalled();
  });
});
