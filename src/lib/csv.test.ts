import { describe, expect, it } from "vitest";
import { csvCell, csvRow } from "./csv";

describe("csvCell", () => {
  it("passes plain text through and blanks null/undefined", () => {
    expect(csvCell("Ravi")).toBe("Ravi");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
  it.each(["=SUM(A1)", "+1", "-1+2", "@cmd", "\tx", "\rx"])("neutralises formula starter %j", (v) => {
    expect(csvCell(v).replace(/^"/, "").startsWith("'")).toBe(true);
  });
  it("quotes and escapes quotes, commas and newlines", () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell("a\nb")).toBe('"a\nb"');
  });
  it("neutralises and escapes together", () => {
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe('"\'=HYPERLINK(""http://x"",""y"")"');
  });
  it("keeps real negative numbers numeric", () => {
    expect(csvCell(-100)).toBe("-100");
  });
  it("csvRow joins cells", () => {
    expect(csvRow(["a", "=b", 3])).toBe("a,'=b,3");
  });
});
