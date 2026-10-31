import { describe, expect, it } from "vitest";
import { renderArticleBody } from "./articleHtml";

describe("renderArticleBody", () => {
  it("keeps the structure answer engines quote from: headings, lists, emphasis", () => {
    const html = "<h2>What is BP?</h2><p>It is <strong>pressure</strong>.</p><ul><li>a</li></ul>";
    expect(renderArticleBody(html)).toBe(html);
  });

  it("normalises heading levels and bold/italic tags", () => {
    expect(renderArticleBody("<h1>T</h1><h5>x</h5><b>b</b><i>i</i>")).toBe("<h2>T</h2><h4>x</h4><strong>b</strong><em>i</em>");
  });

  it("drops scripts, styles, iframes and comments together with their content", () => {
    expect(renderArticleBody('<p>a</p><script>alert(1)</script><style>p{}</style><iframe src="x"></iframe><!-- c --><p>b</p>')).toBe("<p>a</p><p>b</p>");
  });

  it("strips every attribute, including event handlers and inline styles", () => {
    expect(renderArticleBody('<p onclick="x()" style="color:red" class="c">hi</p>')).toBe("<p>hi</p>");
  });

  it("keeps only http(s) and site-relative links, marked nofollow ugc", () => {
    expect(renderArticleBody('<a href="https://who.int/x?a=1&amp;b=2">WHO</a>')).toBe('<a href="https://who.int/x?a=1&amp;b=2" rel="nofollow ugc noopener">WHO</a>');
    expect(renderArticleBody('<a href="/dr/dr-a">Dr A</a>')).toContain('href="/dr/dr-a"');
    expect(renderArticleBody('<a href="javascript:alert(1)">bad</a>')).toBe("bad");
    expect(renderArticleBody('<a href="//evil.example">x</a>')).toBe("x");
  });

  it("escapes stray angle brackets without double-escaping entities", () => {
    expect(renderArticleBody("<p>a < b &amp; c</p>")).toBe("<p>a &lt; b &amp; c</p>");
  });

  it("closes unclosed tags and ignores stray closing tags", () => {
    expect(renderArticleBody("<ul><li>a")).toBe("<ul><li>a</li></ul>");
    expect(renderArticleBody("</p>text")).toBe("text");
  });

  it("renders legacy markdown posts", () => {
    const out = renderArticleBody("## Hi\n\ntext");
    expect(out).toContain("<h2>Hi</h2>");
    expect(out).toContain("<p>text</p>");
  });

  it("returns '' for empty input and bounds huge input", () => {
    expect(renderArticleBody(null)).toBe("");
    expect(renderArticleBody("   ")).toBe("");
    expect(renderArticleBody(`<p>${"x".repeat(500_000)}</p>`).length).toBeLessThan(130_000);
  });
});

describe("renderArticleBody - XSS hardening", () => {
  const dangerous = /<script|<img|<iframe|onerror|onclick|javascript:|<svg|<style/i;

  it("drops uppercase / mixed-case script and style blocks with content", () => {
    expect(renderArticleBody("<p>a</p><SCRIPT>alert(1)</SCRIPT><p>b</p>")).toBe("<p>a</p><p>b</p>");
    expect(renderArticleBody("<p>a</p><ScRiPt >alert(1)</sCrIpT ><p>b</p>")).toBe("<p>a</p><p>b</p>");
    expect(renderArticleBody("<STYLE>p{}</STYLE><p>b</p>")).toBe("<p>b</p>");
  });

  it("drops an unclosed script block and everything after it", () => {
    const out = renderArticleBody("<p>a</p><script>alert(1)<p>b</p>");
    expect(out).toBe("<p>a</p>");
  });

  it("drops img (and its onerror handler), svg and math entirely", () => {
    expect(renderArticleBody('<p>a<img src=x onerror=alert(1)>b</p>')).toBe("<p>ab</p>");
    expect(renderArticleBody('<p>a<IMG SRC="x" ONERROR="alert(1)">b</p>')).toBe("<p>ab</p>");
    expect(renderArticleBody('<svg onload=alert(1)><circle/></svg><p>b</p>')).toBe("<p>b</p>");
    expect(renderArticleBody('<math><mi>x</mi></math><p>b</p>')).toBe("<p>b</p>");
  });

  it("rejects javascript: in any case, quoting, or whitespace/entity obfuscation", () => {
    for (const href of [
      'href="JaVaScRiPt:alert(1)"',
      "href=javascript:alert(1)",
      "href='javascript:alert(1)'",
      'href=" javascript:alert(1)"',
      'href="java&#115;cript:alert(1)"',
      'href="java\tscript:alert(1)"',
      'href="&#106;avascript:alert(1)"',
      'href="data:text/html,<script>alert(1)</script>"',
      'href="vbscript:x"',
    ]) {
      const out = renderArticleBody(`<a ${href}>click</a>`);
      expect(out, href).toBe("click");
    }
  });

  it("rejects protocol-relative URLs hidden behind backslashes or entities", () => {
    expect(renderArticleBody('<a href="/\\evil.example">x</a>')).toBe("x");
    expect(renderArticleBody('<a href="/&#x2F;evil.example">x</a>')).toBe("x");
    expect(renderArticleBody('<a href="/&sol;evil.example">x</a>')).toBe("x");
    expect(renderArticleBody('<a href="https:///x">x</a>')).toBe("x");
  });

  it("accepts an unquoted safe href and rebuilds it with escaping", () => {
    expect(renderArticleBody("<a href=https://who.int/a>W</a>")).toBe('<a href="https://who.int/a" rel="nofollow ugc noopener">W</a>');
  });

  it("does not let attribute values containing '>' leak markup", () => {
    const out = renderArticleBody('<p title="a>b<script>alert(1)</script>">hi</p>');
    expect(out).toBe("<p>hi</p>");
    const link = renderArticleBody('<a title=\'x>y\' href="https://who.int">W</a>');
    expect(link).toBe('<a href="https://who.int" rel="nofollow ugc noopener">W</a>');
  });

  it("never nests anchors and balances unclosed ones", () => {
    const out = renderArticleBody('<a href="https://a.example">one<a href="https://b.example">two');
    expect(out).toBe('<a href="https://a.example" rel="nofollow ugc noopener">one</a><a href="https://b.example" rel="nofollow ugc noopener">two</a>');
  });

  it("escapes angle brackets and quotes in text, so entity-encoded tags stay inert text", () => {
    const out = renderArticleBody('<p>&lt;script&gt;alert(1)&lt;/script&gt; "q" <b</p>');
    expect(out).not.toMatch(/<script/i);
    expect(out).toContain("&lt;script&gt;");
  });

  it("neutralises tag-like junk with slashes and odd separators", () => {
    expect(renderArticleBody("<p/onclick=alert(1)>hi</p>")).toBe("<p>hi</p>");
    expect(renderArticleBody("<a/href=javascript:alert(1)>x</a>")).toBe("x");
    expect(renderArticleBody("<scr<script>ipt>alert(1)</scr</script>ipt>")).not.toMatch(/<script/i);
  });

  it("neutralises dangerous links/images in legacy markdown (no anchor, no img tag)", () => {
    const out = renderArticleBody("# T\n\n[x](javascript:alert(1))\n\n![i](x \"onerror=alert(1)\")\n\n[ok](https://who.int)");
    expect(out).not.toMatch(/<img|<script|href="javascript|<[^>]*onerror/i);
    expect(out).toContain('<a href="https://who.int" rel="nofollow ugc noopener">ok</a>');
  });

  it("mixed markdown + raw script is treated as HTML: script dropped, rest inert text", () => {
    const out = renderArticleBody("# T\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>");
    expect(out).not.toMatch(/<script|<img|<[^>]*onerror/i);
  });

  it("emits no attributes other than href/rel on anchors", () => {
    const out = renderArticleBody('<h2 id="a" onmouseover="x">T</h2><td colspan=2 style=x>c</td><a href="/x" onclick="y" target=_blank>l</a>');
    expect(out).toBe('<h2>T</h2><td>c</td><a href="/x" rel="nofollow ugc noopener">l</a>');
  });
});

describe("renderArticleBody - resource limits", () => {
  const cases: Record<string, string> = {
    "unterminated <p": "<p ".repeat(40000),
    "unterminated <a": "<a ".repeat(40000),
    "unterminated quote": '<a "'.repeat(24000),
    "unclosed <script": "<script".repeat(17000),
    "unterminated href": '<a href="'.repeat(15000),
    "unclosed comments": "<!--".repeat(30000),
    "ampersands": "&".repeat(100000),
    "deep blockquote markdown": "> ".repeat(60000),
    "deep nested list markdown": "1. ".repeat(40000),
    "emphasis-heavy markdown blocks": ("*a ".repeat(80) + "\n\n").repeat(80),
    "one huge emphasis paragraph": "*a ".repeat(6000),
    "many open tags then stray closers": "<ul>".repeat(7000) + "</p>".repeat(7000),
    "sparse > with unterminated quotes": ('<a "' + "x".repeat(1500) + ">").repeat(30),
  };
  for (const [name, input] of Object.entries(cases)) {
    it(`stays fast and does not throw: ${name}`, () => {
      const t = performance.now();
      const out = renderArticleBody(input.slice(0, 120_000));
      const ms = performance.now() - t;
      expect(typeof out).toBe("string");
      expect(ms).toBeLessThan(200);
    });
  }

  it("falls back to escaped paragraphs when markdown cannot be parsed", () => {
    const out = renderArticleBody("> ".repeat(60000));
    expect(out).not.toMatch(/<(?!\/?(p|blockquote)>)/);
  });
});
