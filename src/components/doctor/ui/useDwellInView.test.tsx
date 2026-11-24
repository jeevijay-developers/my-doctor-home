import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useDwellInView } from "./useDwellInView";

let trigger: (visible: boolean) => void = () => {};
class FakeObserver {
  constructor(cb: IntersectionObserverCallback) {
    trigger = (visible) => cb([{ isIntersecting: visible } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
  observe() {}
  disconnect() {}
  unobserve() {}
  takeRecords() { return []; }
}

const Probe = () => {
  const [ref, seen] = useDwellInView<HTMLDivElement>(600);
  return <div ref={ref} data-testid="probe">{seen ? "loaded" : "waiting"}</div>;
};

describe("useDwellInView", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("IntersectionObserver", FakeObserver);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not trigger for something merely scrolled past", () => {
    render(<Probe />);
    act(() => trigger(true));
    act(() => { vi.advanceTimersByTime(300); });
    act(() => trigger(false)); // scrolled away before the dwell time
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByTestId("probe")).toHaveTextContent("waiting");
  });

  it("triggers once it has stayed in view long enough, and stays triggered", () => {
    render(<Probe />);
    act(() => trigger(true));
    act(() => { vi.advanceTimersByTime(650); });
    expect(screen.getByTestId("probe")).toHaveTextContent("loaded");
    act(() => trigger(false));
    expect(screen.getByTestId("probe")).toHaveTextContent("loaded");
  });

  it("falls back to loaded where IntersectionObserver does not exist", () => {
    vi.unstubAllGlobals();
    // simulate an environment without the API
    delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
    render(<Probe />);
    expect(screen.getByTestId("probe")).toHaveTextContent("loaded");
  });
});
