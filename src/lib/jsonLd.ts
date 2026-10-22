/** Serialize JSON-LD and escape "<" so the payload cannot close the script tag. */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
