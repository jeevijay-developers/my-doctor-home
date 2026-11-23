import { describe, expect, it } from "vitest";
import { addHeadingIds } from "./articleToc";

describe("addHeadingIds", () => {
  it("adds ids to h2 and h3 and lists them in order", () => {
    const { html, headings } = addHeadingIds("<p>Intro</p><h2>First part</h2><h3>Detail one</h3><h2>Second part</h2>");
    expect(headings).toEqual([
      { id: "first-part", text: "First part", level: 2 },
      { id: "detail-one", text: "Detail one", level: 3 },
      { id: "second-part", text: "Second part", level: 2 },
    ]);
    expect(html).toContain('<h2 id="first-part">First part</h2>');
  });

  it("keeps ids unique when headings repeat", () => {
    const { headings } = addHeadingIds("<h2>Tips</h2><h2>Tips</h2><h2>Tips</h2>");
    expect(headings.map((h) => h.id)).toEqual(["tips", "tips-2", "tips-3"]);
  });

  it("keeps an id the author already set and skips empty headings", () => {
    const { headings } = addHeadingIds('<h2 id="mine">Custom</h2><h2>  </h2>');
    expect(headings).toEqual([{ id: "mine", text: "Custom", level: 2 }]);
  });

  it("handles numbered and non-latin headings", () => {
    const { headings } = addHeadingIds("<h3>1. Eat a Balanced Diet</h3><h2>हृदय स्वास्थ्य</h2>");
    expect(headings[0].id).toBe("1-eat-a-balanced-diet");
    expect(headings[1].id).toBe("हृदय-स्वास्थ्य");
  });

  it("returns the input untouched when there is nothing to do", () => {
    expect(addHeadingIds("")).toEqual({ html: "", headings: [] });
    expect(addHeadingIds("<p>No headings</p>").headings).toEqual([]);
  });
});
