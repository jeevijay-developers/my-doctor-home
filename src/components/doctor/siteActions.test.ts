import { beforeEach, describe, expect, it, vi } from "vitest";

const scroll = vi.hoisted(() => ({ dsScrollTo: vi.fn() }));
vi.mock("./motion/scroll", () => scroll);

import { bookNow } from "./siteActions";

describe("bookNow", () => {
  beforeEach(() => {
    scroll.dsScrollTo.mockReset();
    document.body.innerHTML = "";
  });

  it("goes to the booking card so dates and times are on screen", () => {
    document.body.innerHTML = '<section id="booking"><div id="booking-card"></div></section>';
    bookNow();
    expect(scroll.dsScrollTo).toHaveBeenCalledWith("booking-card");
  });

  it("falls back to the booking section while it shows a confirmation or a failed payment (no card)", () => {
    document.body.innerHTML = '<section id="booking"></section>';
    bookNow();
    expect(scroll.dsScrollTo).toHaveBeenCalledWith("booking", { focusSelector: "[data-booking-start]" });
  });
});
