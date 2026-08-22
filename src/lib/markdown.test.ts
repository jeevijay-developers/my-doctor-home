import { describe, expect, it } from "vitest";
import { markdownToHtml } from "./markdown";

describe("markdownToHtml", () => {
  it("renders level two through four headings", () => {
    const html = markdownToHtml("## Heading 2\n### Heading 3\n#### Heading 4");

    expect(html).toContain("<h2>Heading 2</h2>");
    expect(html).toContain("<h3>Heading 3</h3>");
    expect(html).toContain("<h4>Heading 4</h4>");
  });

  it("renders bold text", () => {
    expect(markdownToHtml("This is **bold**.")).toContain("<strong>bold</strong>");
  });

  it("renders ordered and unordered lists", () => {
    const html = markdownToHtml("1. First\n2. Second\n\n- One\n- Two");

    expect(html).toContain("<ol>");
    expect(html).toContain("<li>First</li>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>One</li>");
  });

  it("renders paragraphs and horizontal rules", () => {
    const html = markdownToHtml("First paragraph.\n\nSecond paragraph.\n\n---");

    expect(html).toContain("<p>First paragraph.</p>");
    expect(html).toContain("<p>Second paragraph.</p>");
    expect(html).toContain("<hr>");
  });

  it("separates collapsed heading, list, and rule blocks", () => {
    const html = markdownToHtml("Intro## Heading- One- Two---");

    expect(html).toContain("<p>Intro</p>");
    expect(html).toContain("<h2>Heading</h2>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>One</li>");
    expect(html).toContain("<li>Two</li>");
    expect(html).toContain("<hr>");
  });

  it("renders ordinary text as a paragraph", () => {
    expect(markdownToHtml("A short paragraph.")).toBe("<p>A short paragraph.</p>\n");
  });

  it("preserves ordinary hashes, asterisks, and hyphens", () => {
    const html = markdownToHtml("Use C# and foo - bar * here.");

    expect(html).toContain("Use C# and foo - bar * here.");
    expect(html).not.toContain("<ul>");
  });

  it("passes existing HTML through while sanitizing it", () => {
    const html = markdownToHtml('<h2 class="article-heading">Existing</h2><p>HTML</p>');

    expect(html).toContain('<h2 class="article-heading">Existing</h2>');
    expect(html).toContain("<p>HTML</p>");
  });

  it("removes unsafe tags and attributes", () => {
    const html = markdownToHtml('<p onclick="alert(1)">Safe</p><script>alert(1)</script>');

    expect(html).toContain("<p>Safe</p>");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("<script");
  });

  it("returns an empty string for missing content", () => {
    expect(markdownToHtml(null)).toBe("");
    expect(markdownToHtml(undefined)).toBe("");
    expect(markdownToHtml("")).toBe("");
  });
});