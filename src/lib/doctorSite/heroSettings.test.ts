import { describe, expect, it } from "vitest";
import { heroPhotoBadge, withoutPlatformDefaults } from "./heroSettings";

describe("withoutPlatformDefaults", () => {
  it("blanks the platform's pre-filled hero text so the editor matches the site", () => {
    const out = withoutPlatformDefaults({
      hero_headline_line1: "Trusted Care for",
      hero_headline_line2: "You & Your Family",
      hero_description: "Compassionate, personalized and professional healthcare for a better tomorrow.",
      hero_stat_text: "5,000+ Patient Consultations",
      hero_location_label: "Clinic Location",
      hero_hours_label: "Consultation",
      hero_primary_button_label: "Book Appointment",
      hero_secondary_button_label: "Call Now",
      hero_directions_label: "Get Directions",
      seo_title: "kept",
    });
    expect(out).toEqual({
      hero_headline_line1: "", hero_headline_line2: "", hero_description: "", hero_stat_text: "",
      hero_location_label: "", hero_hours_label: "", hero_primary_button_label: "",
      hero_secondary_button_label: "", hero_directions_label: "", seo_title: "kept",
    });
  });

  it("keeps everything the doctor wrote", () => {
    const own = { hero_headline_line1: "Trusted Care for", hero_headline_line2: "children", hero_description: "Mine.", hero_location_label: "Find us" };
    expect(withoutPlatformDefaults(own)).toEqual(own);
  });
});

describe("heroPhotoBadge", () => {
  const facts = [
    { id: "experience", value: "9 yrs", label: "Experience" },
    { id: "rating", value: "4.8", label: "12 reviews" },
  ];
  it("prefers the doctor's own badge, with their icon", () => {
    expect(heroPhotoBadge({ hero_stat_text: "1,200+ treated", hero_stat_icon: "Heart" }, facts)).toEqual({ value: "1,200+ treated", label: "", icon: "Heart" });
  });
  it("otherwise the rating, then the experience; never the platform filler", () => {
    expect(heroPhotoBadge({ hero_stat_text: "5,000+ Patient Consultations" }, facts)?.value).toBe("4.8 / 5");
    expect(heroPhotoBadge({}, [facts[0]])?.value).toBe("9 yrs");
    expect(heroPhotoBadge({}, [])).toBeNull();
  });
  it("switched off means no badge", () => {
    expect(heroPhotoBadge({ show_hero_stat_badge: false, hero_stat_text: "Mine" }, facts)).toBeNull();
  });
});

describe("readPreviewMessage (live preview inside My Website)", () => {
  const withParent = (run: (parent: Window) => void) => {
    const parent = {} as Window;
    const original = Object.getOwnPropertyDescriptor(window, "parent");
    Object.defineProperty(window, "parent", { configurable: true, value: parent });
    try {
      run(parent);
    } finally {
      if (original) Object.defineProperty(window, "parent", original);
    }
  };
  const msg = (data: unknown, source: unknown, origin = window.location.origin) => ({ data, source, origin }) as unknown as MessageEvent;
  const good = { type: "doctylia:preview-settings", slug: "asha", settings: { hero_description: "Draft" } };

  it("accepts the editor's settings for this clinic", async () => {
    const { readPreviewMessage } = await import("./heroSettings");
    withParent((parent) => expect(readPreviewMessage(msg(good, parent), "asha")).toEqual({ hero_description: "Draft" }));
  });

  it("ignores other sites, other windows, other clinics and pages that are not framed", async () => {
    const { readPreviewMessage } = await import("./heroSettings");
    withParent((parent) => {
      expect(readPreviewMessage(msg(good, parent, "https://evil.example"), "asha")).toBeNull();
      expect(readPreviewMessage(msg(good, {}), "asha")).toBeNull();
      expect(readPreviewMessage(msg(good, parent), "other-doctor")).toBeNull();
      expect(readPreviewMessage(msg({ ...good, type: "x" }, parent), "asha")).toBeNull();
    });
    expect(readPreviewMessage(msg(good, window), "asha")).toBeNull(); // not inside a frame
  });
});
