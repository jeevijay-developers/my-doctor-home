// Turns a stored article (editor HTML, or legacy markdown) into a small, safe HTML
// subset for the crawler-facing body. GPTBot, ClaudeBot and PerplexityBot do not execute
// JavaScript, so this is the only copy of the article they read: it must keep headings,
// lists and links. The Edge runtime has no DOM, so this is an allowlist tokenizer - every
// kept tag is rebuilt with NO attributes (except a vetted href) and all text is escaped.
//
// SECURITY: the output is injected into server-rendered HTML. Nothing from the input is
// ever copied verbatim except escaped text and a vetted href.
//
// NOTE: relative imports only - Vercel's bundler does not resolve "@/".
import { marked } from "marked";

const ALLOWED = new Set(["h2", "h3", "h4", "p", "ul", "ol", "li", "strong", "em", "blockquote", "br", "table", "thead", "tbody", "tr", "th", "td", "a"]);
const RENAME: Record<string, string> = { h1: "h2", h5: "h4", h6: "h4", b: "strong", i: "em" };
const RAW_TEXT_TAGS = ["script", "style", "iframe", "object", "embed", "noscript", "template", "svg", "math", "textarea", "title", "xmp", "noembed", "noframes"];
// One closing-tag matcher per raw-text element, searched from a moving lastIndex so no region is rescanned.
const RAW_CLOSERS = new Map(RAW_TEXT_TAGS.map((t) => [t, new RegExp(String.raw`<\/${t}\s*>`, "gi")]));
// Work limits keep the scanner linear: a hostile post must not be able to burn Edge CPU.
const MAX_SOURCE_CHARS = 60_000;
const MAX_MARKDOWN_CHARS = 20_000;
const MAX_TAG_CHARS = 2048;

const isLetter = (c: number) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
const isAlnum = (c: number) => isLetter(c) || (c >= 48 && c <= 57);

/** Escapes text but leaves existing entities (&amp; &nbsp; &#39;) alone so they are not double-escaped. */
const escapeText = (t: string) =>
  t.replace(/&(?!(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);)/gi, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Extracts a vetted href from a tag's attribute string. Accepts quoted or unquoted values,
 * only absolute http(s) or single-slash site-relative URLs. Entities other than &amp; are
 * rejected because browsers decode them inside attributes ("/&#x2F;evil.com" -> "//evil.com").
 */
function safeHref(attrs: string): string | null {
  const m = /(?:^|[\s/])href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`=]+))/i.exec(attrs);
  const raw = (m?.[1] ?? m?.[2] ?? m?.[3] ?? "").trim();
  if (!raw) return null;
  if (/&(?!amp;)/i.test(raw)) return null;
  // Control characters are rejected on purpose: browsers strip them from URLs ("java\tscript:").
  // eslint-disable-next-line no-control-regex
  if (/[\s"'<>`\\\u0000-\u001f\u007f]/.test(raw)) return null;
  const ok = /^https?:\/\/[^/]/i.test(raw) || /^\/(?![/\\])/.test(raw);
  return ok ? raw : null;
}

/** Linear equivalent of /<\/?[a-z][\s\S]*>/i: a tag-like "<x" or "</x" that is followed somewhere by a ">". */
function looksLikeHtml(src: string): boolean {
  const lastGt = src.lastIndexOf(">");
  if (lastGt === -1) return false;
  let i = src.indexOf("<");
  while (i !== -1 && i < lastGt) {
    const at = src.charCodeAt(i + 1) === 47 ? i + 2 : i + 1;
    if (at < lastGt && isLetter(src.charCodeAt(at))) return true;
    i = src.indexOf("<", i + 1);
  }
  return false;
}

const MAX_MARKDOWN_BLOCK_CHARS = 3000;
const MAX_MARKDOWN_DELIMS = 40; // per block
const MAX_MARKDOWN_TOTAL_DELIMS = 400; // per document
const MAX_MARKDOWN_NESTING = 12;

/** True when any line stacks more than MAX_MARKDOWN_NESTING block prefixes ("> > >", "1. 1. 1.", "- - -"). Linear. */
function tooDeeplyNested(md: string): boolean {
  const n = md.length;
  let i = 0;
  while (i < n) {
    let depth = 0;
    let j = i;
    for (;;) {
      while (j < n && (md.charCodeAt(j) === 32 || md.charCodeAt(j) === 9)) j++;
      const c = md.charCodeAt(j);
      let next = -1;
      if (c === 62) next = j + 1; // ">"
      else if ((c === 45 || c === 42 || c === 43) && (md.charCodeAt(j + 1) === 32 || md.charCodeAt(j + 1) === 9)) next = j + 2; // "- "
      else if (c >= 48 && c <= 57) {
        let k = j;
        while (k < n && k < j + 9 && md.charCodeAt(k) >= 48 && md.charCodeAt(k) <= 57) k++;
        if ((md.charCodeAt(k) === 46 || md.charCodeAt(k) === 41) && md.charCodeAt(k + 1) === 32) next = k + 2; // "1. "
      }
      if (next === -1) break;
      if (++depth > MAX_MARKDOWN_NESTING) return true;
      j = next;
    }
    const nl = md.indexOf("\n", j);
    if (nl === -1) break;
    i = nl + 1;
  }
  return false;
}

/** Splits on blank lines. Linear. */
function splitBlocks(text: string): string[] {
  const blocks: string[] = [];
  let cur: string[] = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") { if (cur.length) blocks.push(cur.join("\n")); cur = []; } else cur.push(line);
  }
  if (cur.length) blocks.push(cur.join("\n"));
  return blocks;
}

/** Counts inline-markup delimiters (* _ [ ] `), which drive marked's super-linear inline parsing. */
function delimiterCount(b: string): number {
  let n = 0;
  for (let i = 0; i < b.length; i++) {
    const c = b.charCodeAt(i);
    if (c === 42 || c === 95 || c === 91 || c === 93 || c === 96) n++;
  }
  return n;
}

const plainBlock = (b: string) => `<p>${escapeText(b)}</p>`;

/**
 * Markdown to HTML. marked has super-linear inline parsing (many emphasis/link delimiters in one paragraph) and overflows the
 * stack on deep nesting, so a block that is too long or too deeply nested, or a parser failure, falls back to
 * an escaped plain paragraph instead of being parsed.
 */
function markdownToHtml(md: string): string {
  const blocks = splitBlocks(md.slice(0, MAX_MARKDOWN_CHARS));
  let budget = MAX_MARKDOWN_TOTAL_DELIMS;
  const ok = blocks.map((b) => {
    if (b.length > MAX_MARKDOWN_BLOCK_CHARS) return false;
    const d = delimiterCount(b);
    if (d > MAX_MARKDOWN_DELIMS || d > budget || tooDeeplyNested(b)) return false;
    budget -= d;
    return true;
  });
  const parse = (text: string) => marked.parse(text, { async: false }) as string;
  if (ok.every(Boolean)) {
    try { return parse(blocks.join("\n\n")); } catch { return blocks.map(plainBlock).join(""); }
  }
  return blocks.map((b, i) => {
    if (!ok[i]) return plainBlock(b);
    try { return parse(b); } catch { return plainBlock(b); }
  }).join("");
}

export function renderArticleBody(content: string | null | undefined): string {
  let src = (content ?? "").slice(0, MAX_SOURCE_CHARS);
  if (!src.trim()) return "";
  if (!looksLikeHtml(src)) src = markdownToHtml(src);

  const out: string[] = [];
  const open: string[] = [];
  const counts = new Map<string, number>();
  const popTo = (at: number) => {
    while (open.length > at) {
      const t = open.pop() as string;
      counts.set(t, (counts.get(t) ?? 1) - 1);
      out.push(`</${t}>`);
    }
  };
  const push = (t: string) => { open.push(t); counts.set(t, (counts.get(t) ?? 0) + 1); };

  const n = src.length;
  let nextGt = -2; // cached position of the next ">" at or after the scan point; Infinity when none
  let i = 0;
  while (i < n) {
    const lt = src.indexOf("<", i);
    if (lt === -1) { out.push(escapeText(src.slice(i))); break; }
    if (lt > i) out.push(escapeText(src.slice(i, lt)));
    i = lt + 1; // default: this "<" is literal text

    if (src.startsWith("<!--", lt)) {
      const end = src.indexOf("-->", lt + 4);
      if (end === -1) break; // unclosed comment: drop the rest
      i = end + 3;
      continue;
    }

    let j = lt + 1;
    const closing = src.charCodeAt(j) === 47;
    if (closing) j++;
    const nameStart = j;
    if (!isLetter(src.charCodeAt(nameStart))) { out.push("&lt;"); continue; }
    const limit = Math.min(n, lt + MAX_TAG_CHARS);
    while (j < limit && isAlnum(src.charCodeAt(j))) j++;
    const nameEnd = j;
    const after = src.charCodeAt(nameEnd); // NaN at end of input
    if (after === 95) { out.push("&lt;"); continue; } // "_" is a word character: no  after the name

    const raw = src.slice(nameStart, nameEnd).toLowerCase();
    if (!closing) {
      const closer = RAW_CLOSERS.get(raw);
      if (closer) {
        // Drop the element with its content; with no closing tag, drop everything to the end.
        closer.lastIndex = nameEnd;
        const m = closer.exec(src);
        if (!m) break;
        i = m.index + m[0].length;
        continue;
      }
    }

    // Find the end of the tag. Quoted values may contain ">"; give up (literal "<") on an
    // unterminated quote or when no ">" is reachable within MAX_TAG_CHARS.
    if (nameEnd >= limit) { out.push("&lt;"); continue; }
    if (nextGt < nameEnd) { nextGt = src.indexOf(">", nameEnd); if (nextGt === -1) nextGt = Infinity; }
    if (nextGt >= limit) { out.push("&lt;"); continue; }
    let k = nameEnd;
    let end = -1;
    while (k < limit) {
      const c = src.charCodeAt(k);
      if (c === 62) { end = k; break; }
      if (c === 34 || c === 39) {
        let q = k + 1;
        while (q < limit && src.charCodeAt(q) !== c) q++;
        if (q >= limit) break;
        k = q + 1;
      } else k++;
    }
    if (end === -1) { out.push("&lt;"); continue; }
    const attrs = src.slice(nameEnd, end);
    i = end + 1;

    const tag = RENAME[raw] ?? raw;
    if (!ALLOWED.has(tag)) continue;

    if (closing) {
      if (!counts.get(tag)) continue;
      popTo(open.lastIndexOf(tag));
    } else if (tag === "br") {
      out.push("<br>");
    } else if (tag === "a") {
      // Anchors never nest: a new one closes the previous one.
      if (counts.get("a")) popTo(open.lastIndexOf("a"));
      const href = safeHref(attrs);
      // An unsafe link keeps its text but loses the anchor; its closing tag then finds no match and is ignored.
      if (href) { push("a"); out.push(`<a href="${escapeText(href)}" rel="nofollow ugc noopener">`); }
    } else {
      push(tag);
      out.push(`<${tag}>`);
    }
  }
  popTo(0);
  return out.join("").replace(/<p>\s*<\/p>/g, "");
}
