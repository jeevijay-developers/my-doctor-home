import { describe, expect, it } from "vitest";
import { edgeFunctionErrorMessage } from "./edgeFunctionError";

const withBody = (body: unknown) => ({ context: { json: async () => body } });

describe("edgeFunctionErrorMessage", () => {
  it("prefers body.message over body.error", async () => {
    expect(await edgeFunctionErrorMessage(withBody({ message: "M", error: "E" }), "fb")).toBe("M");
  });
  it("uses body.error when there is no message", async () => {
    expect(await edgeFunctionErrorMessage(withBody({ error: "E" }), "fb")).toBe("E");
  });
  it("stringifies non-string values", async () => {
    expect(await edgeFunctionErrorMessage(withBody({ error: 42 }), "fb")).toBe("42");
  });
  it("falls back when body has neither, or empty strings, or null", async () => {
    expect(await edgeFunctionErrorMessage(withBody({}), "fb")).toBe("fb");
    expect(await edgeFunctionErrorMessage(withBody({ message: "", error: "" }), "fb")).toBe("fb");
    expect(await edgeFunctionErrorMessage(withBody(null), "fb")).toBe("fb");
  });
  it("falls back when json() rejects", async () => {
    const e = {
      context: {
        json: async () => {
          throw new SyntaxError("bad json");
        },
      },
    };
    expect(await edgeFunctionErrorMessage(e, "fb")).toBe("fb");
  });
  it("falls back for null/undefined/plain errors/context without json", async () => {
    expect(await edgeFunctionErrorMessage(null, "fb")).toBe("fb");
    expect(await edgeFunctionErrorMessage(undefined, "fb")).toBe("fb");
    expect(await edgeFunctionErrorMessage(new Error("x"), "fb")).toBe("fb");
    expect(await edgeFunctionErrorMessage({ context: {} }, "fb")).toBe("fb");
    expect(await edgeFunctionErrorMessage({ context: { json: "nope" } }, "fb")).toBe("fb");
  });
  it("works with a real Response", async () => {
    const res = new Response(JSON.stringify({ error: "Nope" }), { status: 400 });
    expect(await edgeFunctionErrorMessage({ context: res }, "fb")).toBe("Nope");
  });
});
