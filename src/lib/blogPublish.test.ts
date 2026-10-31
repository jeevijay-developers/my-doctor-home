import { describe, expect, it } from "vitest";
import { nextPublishedAt } from "./blogPublish";

const now = new Date("2026-10-31T10:00:00Z");

describe("nextPublishedAt", () => {
  it("stamps now for a brand-new published post", () => {
    expect(nextPublishedAt(null, true, now)).toBe("2026-10-31T10:00:00.000Z");
  });
  it("keeps the original date when a published post is edited and stays published", () => {
    expect(nextPublishedAt({ is_published: true, published_at: "2026-01-05T00:00:00.000Z" }, true, now)).toBe("2026-01-05T00:00:00.000Z");
  });
  it("stamps now when a draft is published", () => {
    expect(nextPublishedAt({ is_published: false, published_at: null }, true, now)).toBe("2026-10-31T10:00:00.000Z");
  });
  it("stamps now if a published row somehow has no date", () => {
    expect(nextPublishedAt({ is_published: true, published_at: null }, true, now)).toBe("2026-10-31T10:00:00.000Z");
  });
  it("clears the date when saved as a draft", () => {
    expect(nextPublishedAt({ is_published: true, published_at: "2026-01-05T00:00:00.000Z" }, false, now)).toBeNull();
  });
});
