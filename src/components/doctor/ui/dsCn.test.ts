import { describe, expect, it } from "vitest";
import { dsCn } from "./dsCn";

describe("dsCn", () => {
  it("keeps a ds font size next to a ds text color", () => {
    expect(dsCn("text-ds-small font-medium", "text-ds-ink-2")).toBe("text-ds-small font-medium text-ds-ink-2");
  });
  it("still resolves real conflicts", () => {
    expect(dsCn("text-ds-small", "text-ds-label")).toBe("text-ds-label");
    expect(dsCn("text-ds-ink", "text-ds-ink-2")).toBe("text-ds-ink-2");
  });
});
