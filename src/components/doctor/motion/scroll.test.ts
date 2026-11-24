import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dsScrollTo } from "./scroll";

describe("dsScrollTo focus handling", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <section id="booking">
        <h2 data-booking-start>Book an appointment</h2>
        <input id="name" />
      </section>`;
    window.scrollTo = vi.fn();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("scrolls to the section and moves focus to its heading for keyboard and screen-reader users", () => {
    dsScrollTo("booking", { focusSelector: "[data-booking-start]" });
    expect(window.scrollTo).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(600);
    expect(document.activeElement).toBe(document.querySelector("[data-booking-start]"));
  });

  it("does not pull focus away from a field inside the section that already has it", () => {
    // The hero's quick-book opens the widget on the details step with the name field focused.
    dsScrollTo("booking", { focusSelector: "[data-booking-start]" });
    document.getElementById("name")!.focus();
    vi.advanceTimersByTime(600);
    expect(document.activeElement).toBe(document.getElementById("name"));
  });

  it("does nothing for an unknown section", () => {
    dsScrollTo("nope");
    expect(window.scrollTo).not.toHaveBeenCalled();
  });
});
