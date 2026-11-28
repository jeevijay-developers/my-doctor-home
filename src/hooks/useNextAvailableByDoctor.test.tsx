import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));

import { NEXT_AVAILABLE_POLL_MS, resetNextAvailableCache, useNextAvailableByDoctor } from "./useNextAvailableByDoctor";

const rows = (t: string) => ({
  data: [
    { practitioner_id: "pa", next_date: "2026-11-29", next_time: t },
    { practitioner_id: "pb", next_date: null, next_time: null },
  ],
  error: null,
});

describe("useNextAvailableByDoctor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    rpc.mockReset();
    resetNextAvailableCache();
  });
  afterEach(() => vi.useRealTimers());

  it("makes one call for all doctors and maps rows by doctor, NULL -> null", async () => {
    rpc.mockResolvedValue(rows("10:00:00"));
    const { result } = renderHook(() => useNextAvailableByDoctor("clinic", true));
    await act(async () => {});
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("get_public_next_available", { _doctor_id: "clinic", _days: 14 });
    expect(result.current.next).toEqual({ pa: { date: "2026-11-29", time: "10:00:00" }, pb: null });
  });

  it("does nothing when disabled or without a clinic", async () => {
    renderHook(() => useNextAvailableByDoctor("clinic", false));
    renderHook(() => useNextAvailableByDoctor(undefined, true));
    await act(async () => {});
    expect(rpc).not.toHaveBeenCalled();
  });

  it("two consumers on one page share one call", async () => {
    rpc.mockResolvedValue(rows("10:00:00"));
    renderHook(() => useNextAvailableByDoctor("clinic", true));
    renderHook(() => useNextAvailableByDoctor("clinic", true));
    await act(async () => {});
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("polls every 60 s, skips polls while the tab is hidden and refreshes when it is visible again", async () => {
    rpc.mockResolvedValue(rows("10:00:00"));
    const { result } = renderHook(() => useNextAvailableByDoctor("clinic", true));
    await act(async () => {});
    rpc.mockResolvedValue(rows("11:00:00"));
    await act(async () => { vi.advanceTimersByTime(NEXT_AVAILABLE_POLL_MS); });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(result.current.next.pa?.time).toBe("11:00:00");

    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    await act(async () => { vi.advanceTimersByTime(NEXT_AVAILABLE_POLL_MS * 2); });
    expect(rpc).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(rpc).toHaveBeenCalledTimes(3);
  });

  it("a failed call keeps the last value; a failure at first shows nothing", async () => {
    rpc.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useNextAvailableByDoctor("clinic", true));
    await act(async () => {});
    expect(result.current.next).toEqual({});

    rpc.mockResolvedValueOnce(rows("10:00:00"));
    await act(async () => { vi.advanceTimersByTime(NEXT_AVAILABLE_POLL_MS); });
    expect(result.current.next.pa?.time).toBe("10:00:00");

    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await act(async () => { vi.advanceTimersByTime(NEXT_AVAILABLE_POLL_MS); });
    expect(result.current.next.pa?.time).toBe("10:00:00");
    rpc.mockResolvedValueOnce(undefined);
    await act(async () => { vi.advanceTimersByTime(NEXT_AVAILABLE_POLL_MS); });
    expect(result.current.next.pa?.time).toBe("10:00:00");
  });

  it("now moves with each poll, so labels roll over midnight IST without a reload", async () => {
    vi.setSystemTime(new Date("2026-11-28T18:29:00Z"));
    rpc.mockResolvedValue(rows("09:00:00"));
    const { result } = renderHook(() => useNextAvailableByDoctor("clinic", true));
    await act(async () => {});
    const before = result.current.now.getTime();
    await act(async () => { vi.advanceTimersByTime(NEXT_AVAILABLE_POLL_MS); });
    expect(result.current.now.getTime()).toBeGreaterThan(before);
  });
});
