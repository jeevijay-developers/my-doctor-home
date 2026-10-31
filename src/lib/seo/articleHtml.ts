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
const RAW_TEXT_TAGS = "script|style|iframe|object|embed|noscript|template|svg|math|textarea|title|xmp|noembed|noframes";
const DROP_WITH_CONTENT = new RegExp(`<(${RAW_TEXT_TAGS})\\b[\\s\\S]*?<\\/\\1\\s*>`, "gi");
// An opening raw-text tag that never closes: drop everything after it.
const DROP_UNCLOSED = new RegExp(`<(?:${RAW_TEXT_TAGS})\\b[\\s\\S]*$`, "i");
const MAX_SOURCE_CHARS = 120_000;

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

export function renderArticleBody(content: string | null | undefined): string {
  let src = (content ?? "").slice(0, MAX_SOURCE_CHARS);
  if (!src.trim()) return "";
  if (!/<\/?[a-z][\s\S]*>/i.test(src)) src = marked.parse(src, { async: false }) as string;
  src = src.replace(/<!--[\s\S]*?-->/g, "").replace(/<!--[\s\S]*$/, "").replace(DROP_WITH_CONTENT, "").replace(DROP_UNCLOSED, "");

  const out: string[] = [];
  const open: string[] = [];
  // tag (quoted attribute values may contain ">") | text | a lone "<"
  const token = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b((?:"[^"]*"|'[^']*'|[^>"'])*)>|([^<]+)|</g;
  for (const m of src.matchAll(token)) {
    if (m[4] !== undefined) { out.push(escapeText(m[4])); continue; }
    if (m[2] === undefined) { out.push("&lt;"); continue; }

    const raw = m[2].toLowerCase();
    const tag = RENAME[raw] ?? raw;
    if (!ALLOWED.has(tag)) continue;

    if (m[1]) {
      const at = open.lastIndexOf(tag);
      if (at === -1) continue;
      while (open.length > at) out.push(`</${open.pop()}>`);
    } else if (tag === "br") {
      out.push("<br>");
    } else if (tag === "a") {
      // Anchors never nest: a new one closes the previous one.
      const prev = open.lastIndexOf("a");
      if (prev !== -1) while (open.length > prev) out.push(`</${open.pop()}>`);
      const href = safeHref(m[3]);
      // An unsafe link keeps its text but loses the anchor; its closing tag then finds no match and is ignored.
      if (href) { open.push("a"); out.push(`<a href="${escapeText(href)}" rel="nofollow ugc noopener">`); }
    } else {
      open.push(tag);
      out.push(`<${tag}>`);
    }
  }
  while (open.length) out.push(`</${open.pop()}>`);
  return out.join("").replace(/<p>\s*<\/p>/g, "");
}
