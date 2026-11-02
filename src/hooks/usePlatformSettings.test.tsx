import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const m = vi.hoisted(() => ({
  select: vi.fn(),
  from: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
  realtimeCb: null as null | (() => void),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: m.from, channel: m.channel, removeChannel: m.removeChannel },
}));

const load = async () => {
  vi.resetModules();
  return import("./usePlatformSettings");
};

describe("usePlatformSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.realtimeCb = null;
    m.from.mockReturnValue({ select: m.select });
    const ch: any = {
      on: vi.fn((_e: string, _f: unknown, cb: () => void) => {
        m.realtimeCb = cb;
        return ch;
      }),
      subscribe: vi.fn(() => ch),
    };
    m.channel.mockReturnValue(ch);
  });

  it("starts loading, then maps key/value rows into an object", async () => {
    m.select.mockResolvedValue({ data: [{ key: "maintenance_mode", value: true }, { key: "pro_default_price", value: 1999 }] });
    const { usePlatformSettings } = await load();
    const { result } = renderHook(() => usePlatformSettings());
    expect(result.current.loading).toBe(true);
    expect(result.current.settings).toEqual({});
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.settings).toEqual({ maintenance_mode: true, pro_default_price: 1999 });
  });

  it("falls back to empty settings and stops loading when the query fails", async () => {
    m.select.mockRejectedValue(new Error("down"));
    const { usePlatformSettings } = await load();
    const { result } = renderHook(() => usePlatformSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.settings).toEqual({});
  });

  it("serves from cache on a second mount (one query)", async () => {
    m.select.mockResolvedValue({ data: [{ key: "a", value: 1 }] });
    const { usePlatformSettings } = await load();
    const first = renderHook(() => usePlatformSettings());
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    const second = renderHook(() => usePlatformSettings());
    expect(second.result.current.loading).toBe(false);
    expect(second.result.current.settings).toEqual({ a: 1 });
    expect(m.select).toHaveBeenCalledTimes(1);
  });

  it("refreshes on realtime change and tears the channel down on unmount", async () => {
    m.select.mockResolvedValueOnce({ data: [{ key: "maintenance_mode", value: false }] });
    const { usePlatformSettings } = await load();
    const { result, unmount } = renderHook(() => usePlatformSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    m.select.mockResolvedValueOnce({ data: [{ key: "maintenance_mode", value: true }] });
    await act(async () => {
      m.realtimeCb!();
    });
    await waitFor(() => expect(result.current.settings.maintenance_mode).toBe(true));
    unmount();
    expect(m.removeChannel).toHaveBeenCalled();
  });
});
