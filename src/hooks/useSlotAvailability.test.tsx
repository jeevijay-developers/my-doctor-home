import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useSlotAvailability } from "./useSlotAvailability";

const m = vi.hoisted(() => ({ rpc: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: m.rpc, channel: m.channel, removeChannel: m.removeChannel },
}));

describe("useSlotAvailability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const ch: any = { on: vi.fn(() => ch), subscribe: vi.fn(() => ch) };
    m.channel.mockReturnValue(ch);
  });
  afterEach(() => vi.useRealTimers());

  it("maps get_slot_counts rows and flags full slots", async () => {
    m.rpc.mockResolvedValue({ data: [{ time_slot: "10:00 AM", booked: 1 }, { time_slot: "10:30 AM", booked: 0 }] });
    const { result } = renderHook(() => useSlotAvailability("doc-1", "2026-11-01", "online"));
    await waitFor(() => expect(result.current.counts["10:00 AM"]).toBe(1));
    expect(m.rpc).toHaveBeenCalledWith("get_slot_counts", { _doctor_id: "doc-1", _date: "2026-11-01", _appointment_type: "online" });
    expect(result.current.isFull("10:00 AM")).toBe(true);
    expect(result.current.isFull("10:30 AM")).toBe(false);
    expect(result.current.isFull("11:00 AM")).toBe(false);
    expect(result.current.bookedIn("10:00 AM")).toBe(1);
    expect(result.current.bookedIn("nothing")).toBe(0);
  });

  it("defaults appointment type to clinic", async () => {
    m.rpc.mockResolvedValue({ data: [] });
    renderHook(() => useSlotAvailability("doc-1", "2026-11-01"));
    await waitFor(() => expect(m.rpc).toHaveBeenCalled());
    expect(m.rpc.mock.calls[0][1]._appointment_type).toBe("clinic");
  });

  it("does nothing without a doctor or date (no rpc, no channel)", async () => {
    const { result } = renderHook(() => useSlotAvailability(null, "2026-11-01"));
    expect(await result.current.refresh()).toEqual({});
    renderHook(() => useSlotAvailability("doc", undefined));
    expect(m.rpc).not.toHaveBeenCalled();
    expect(m.channel).not.toHaveBeenCalled();
  });

  it("refresh() returns the fresh map directly (no stale closure)", async () => {
    m.rpc.mockResolvedValue({ data: [] });
    const { result } = renderHook(() => useSlotAvailability("doc-1", "2026-11-01"));
    await waitFor(() => expect(m.rpc).toHaveBeenCalled());
    m.rpc.mockResolvedValue({ data: [{ time_slot: "9:00 AM", booked: 2 }] });
    let fresh: Record<string, number> = {};
    await act(async () => {
      fresh = await result.current.refresh();
    });
    expect(fresh).toEqual({ "9:00 AM": 2 });
  });

  it("polls every 8 seconds and cleans up on unmount", async () => {
    vi.useFakeTimers();
    m.rpc.mockResolvedValue({ data: [] });
    const { unmount } = renderHook(() => useSlotAvailability("doc-1", "2026-11-01"));
    await act(async () => {
      await Promise.resolve();
    });
    const initial = m.rpc.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(8000);
    });
    expect(m.rpc.mock.calls.length).toBe(initial + 1);
    unmount();
    await act(async () => {
      vi.advanceTimersByTime(16000);
    });
    expect(m.rpc.mock.calls.length).toBe(initial + 1);
    expect(m.removeChannel).toHaveBeenCalled();
  });

  it("treats null data as empty", async () => {
    m.rpc.mockResolvedValue({ data: null });
    const { result } = renderHook(() => useSlotAvailability("doc-1", "2026-11-01"));
    await waitFor(() => expect(m.rpc).toHaveBeenCalled());
    expect(result.current.counts).toEqual({});
  });
});
