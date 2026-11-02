import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebouncedValue } from "./useDebouncedValue";

describe("useDebouncedValue", () => {
  afterEach(() => vi.useRealTimers());

  it("returns the initial value immediately and only updates after the delay", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 300), { initialProps: { v: "a" } });
    expect(result.current).toBe("a");
    rerender({ v: "b" });
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toBe("a");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe("b");
  });

  it("restarts the timer on every change (only last value wins)", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 350), { initialProps: { v: 1 } });
    rerender({ v: 2 });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender({ v: 3 });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe(1);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(result.current).toBe(3);
  });

  it("defaults to 350ms", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v), { initialProps: { v: "x" } });
    rerender({ v: "y" });
    act(() => {
      vi.advanceTimersByTime(349);
    });
    expect(result.current).toBe("x");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe("y");
  });
});
