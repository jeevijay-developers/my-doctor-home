import type { PostgrestError } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dbErrorMessage } from "./dbErrorMessage";

const err = (code: string, message = "boom"): PostgrestError =>
  ({ code, message, details: "d", hint: "h", name: "PostgrestError" }) as PostgrestError;

describe("dbErrorMessage", () => {
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    spy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => spy.mockRestore());

  it.each([
    ["42P01", /finished setting up/],
    ["23503", /link this record/],
    ["23502", /required field/],
    ["23505", /already exists/],
    ["23514", /isn't valid/],
    ["22P02", /isn't valid/],
    ["42501", /permission/],
  ])("maps %s to a specific message", (code, re) => {
    expect(dbErrorMessage(err(code), "Save", "Could not save")).toMatch(re);
  });

  it("falls back to 'fallback: message' for unknown codes", () => {
    expect(dbErrorMessage(err("XX000", "kaput"), "Save", "Could not save")).toBe("Could not save: kaput");
  });
  it("falls back to bare fallback when message is empty", () => {
    expect(dbErrorMessage(err("XX000", ""), "Save", "Could not save")).toBe("Could not save");
  });
  it("handles a missing code", () => {
    expect(dbErrorMessage({ message: "m" } as PostgrestError, "c", "f")).toBe("f: m");
  });
  it("logs code/message/details/hint under the context", () => {
    dbErrorMessage(err("23505", "dup"), "Add patient", "x");
    expect(spy).toHaveBeenCalledWith("Add patient failed:", { code: "23505", message: "dup", details: "d", hint: "h" });
  });
  it("never leaks the raw message for mapped codes", () => {
    expect(dbErrorMessage(err("42501", "new row violates RLS for secret_table"), "c", "f")).not.toMatch(/secret_table/);
  });
});
