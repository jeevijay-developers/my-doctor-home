// Rewrites the built index.html so crawlers (which mostly don't run JS) receive
// page-specific head tags and readable content. React's createRoot() replaces
// whatever is inside #root, so the injected body never causes a hydration clash.

export function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** JSON for a <script type="application/ld+json">; "<" is escaped so it cannot close the tag. */
export function jsonForScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(new RegExp(String.fromCharCode(0x2028), "g"), "\\u2028")
    .replace(new RegExp(String.fromCharCode(0x2029), "g"), "\\u2029");
}

export interface PageHead {
  title: string;
  description: string;
  canonical: string;
  robots: string;
  ogType?: string;
  image?: string;
  jsonLd?: unknown[];
  /** Trusted HTML (callers must escape their own interpolations). */
  bodyHtml?: string;
}

export const INDEXABLE = "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";
export const NOINDEX = "noindex, follow";

export function renderPage(template: string, page: PageHead): string {
  let html = template
    .replace(/<title>[\s\S]*?<\/title>\s*/i, "")
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, "")
    .replace(/<meta\s+(?:name|property)="(?:description|robots|og:[^"]*|twitter:[^"]*)"[^>]*>\s*/gi, "")
    .replace(/<script\s+type="application\/ld\+json">[\s\S]*?<\/script>\s*/gi, "");

  const t = escapeHtml(page.title);
  const d = escapeHtml(page.description);
  const c = escapeHtml(page.canonical);
  const tags = [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}" />`,
    `<meta name="robots" content="${escapeHtml(page.robots)}" />`,
    `<link rel="canonical" href="${c}" />`,
    `<meta property="og:type" content="${escapeHtml(page.ogType ?? "website")}" />`,
    `<meta property="og:site_name" content="Doctylia" />`,
    `<meta property="og:locale" content="en_IN" />`,
    `<meta property="og:url" content="${c}" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta name="twitter:card" content="${page.image ? "summary_large_image" : "summary"}" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    ...(page.image
      ? [
          `<meta property="og:image" content="${escapeHtml(page.image)}" />`,
          `<meta name="twitter:image" content="${escapeHtml(page.image)}" />`,
        ]
      : []),
    ...(page.jsonLd ?? []).map((j) => `<script type="application/ld+json">${jsonForScript(j)}</script>`),
  ].join("\n    ");

  html = html.replace(/<\/head>/i, () => `    ${tags}\n  </head>`);
  if (page.bodyHtml) {
    html = html.replace(/<div id="root"><\/div>/, () => `<div id="root">${page.bodyHtml}</div>`);
  }
  return html;
}
