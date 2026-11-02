import { describe, expect, it } from "vitest";
import { jsonLdScript } from "./jsonLd";

describe("jsonLdScript", () => {
  it("escapes < so </script> cannot close the tag", () => {
    const out = jsonLdScript({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("<");
    expect(out).toContain("\\u003c/script>");
  });
  it("round-trips through JSON.parse", () => {
    const data = { a: "x < y <!-- z", n: [1, null, true], nested: { s: "</SCRIPT>" } };
    expect(JSON.parse(jsonLdScript(data))).toEqual(data);
  });
  it("escapes the HTML comment opener", () => {
    expect(jsonLdScript("<!--")).not.toContain("<!--");
  });
  it("serializes primitives", () => {
    expect(jsonLdScript(null)).toBe("null");
    expect(jsonLdScript("a")).toBe('"a"');
  });
  it("escapes U+2028 / U+2029 like jsonForScript does", () => {
    const out = jsonLdScript({ s: `a${String.fromCharCode(0x2028)}b${String.fromCharCode(0x2029)}c` });
    expect(out).not.toContain(String.fromCharCode(0x2028));
    expect(out).not.toContain(String.fromCharCode(0x2029));
  });
});
