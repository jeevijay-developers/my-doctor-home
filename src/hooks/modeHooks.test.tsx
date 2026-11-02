import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));

// Both hooks cache at module level, so each test gets a fresh module instance.
const cases = [
  ["usePaymentMode", "./usePaymentMode", "usePaymentMode", "get-payment-mode"],
  ["useNotificationMode", "./useNotificationMode", "useNotificationMode", "get-notification-mode"],
] as const;

describe.each(cases)("%s", (_name, path, exportName, fn) => {
  const load = async () => {
    vi.resetModules();
    const mod: any = await import(/* @vite-ignore */ path);
    return mod[exportName] as () => { mode: "mock" | "live" | null; isMock: boolean };
  };

  beforeEach(() => invoke.mockReset());

  it("is null (not mock) until resolved, then reflects mock", async () => {
    invoke.mockResolvedValue({ data: { mode: "mock" } });
    const hook = await load();
    const { result } = renderHook(() => hook());
    expect(result.current.mode).toBeNull();
    expect(result.current.isMock).toBe(false);
    await waitFor(() => expect(result.current.mode).toBe("mock"));
    expect(result.current.isMock).toBe(true);
    expect(invoke).toHaveBeenCalledWith(fn);
  });

  it("live mode is not mock", async () => {
    invoke.mockResolvedValue({ data: { mode: "live" } });
    const hook = await load();
    const { result } = renderHook(() => hook());
    await waitFor(() => expect(result.current.mode).toBe("live"));
    expect(result.current.isMock).toBe(false);
  });

  it("ignores garbage responses (stays null)", async () => {
    invoke.mockResolvedValue({ data: { mode: "banana" } });
    const hook = await load();
    const { result } = renderHook(() => hook());
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.mode).toBeNull();
  });

  it("ignores an error result (stays null)", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "down" } });
    const hook = await load();
    const { result } = renderHook(() => hook());
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.mode).toBeNull();
  });

  it("caches within the TTL: a second mount does not call the function again", async () => {
    invoke.mockResolvedValue({ data: { mode: "live" } });
    const hook = await load();
    const first = renderHook(() => hook());
    await waitFor(() => expect(first.result.current.mode).toBe("live"));
    const second = renderHook(() => hook());
    expect(second.result.current.mode).toBe("live");
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("shares one in-flight request between simultaneous mounts", async () => {
    invoke.mockResolvedValue({ data: { mode: "mock" } });
    const hook = await load();
    const a = renderHook(() => hook());
    const b = renderHook(() => hook());
    await waitFor(() => expect(a.result.current.mode).toBe("mock"));
    await waitFor(() => expect(b.result.current.mode).toBe("mock"));
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
