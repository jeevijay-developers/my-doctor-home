/** Serialize JSON-LD and escape "<" (cannot close the script tag) and U+2028/2029 (same as seo/injectHead jsonForScript). */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
