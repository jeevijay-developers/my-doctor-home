import { describe, expect, it } from "vitest";
import {
  ACCOUNT_NUMBER_REGEX,
  IFSC_REGEX,
  UPI_REGEX,
  isValidAccountNumber,
  isValidIfsc,
  isValidUpi,
} from "./bankDetails";

describe("isValidIfsc", () => {
  it("accepts canonical codes, case-insensitively and trimmed", () => {
    expect(isValidIfsc("HDFC0001234")).toBe(true);
    expect(isValidIfsc("hdfc0001234")).toBe(true);
    expect(isValidIfsc("  SBIN0ABC123 \n")).toBe(true);
  });
  it("rejects wrong shape", () => {
    expect(isValidIfsc("")).toBe(false);
    expect(isValidIfsc("HDFC1001234")).toBe(false); // 5th char must be 0
    expect(isValidIfsc("HDF00001234")).toBe(false); // 4th must be a letter
    expect(isValidIfsc("HDFC000123")).toBe(false); // too short
    expect(isValidIfsc("HDFC00012345")).toBe(false); // too long
    expect(isValidIfsc("HDFC0001-34")).toBe(false);
    expect(isValidIfsc("1234A0001234")).toBe(false);
  });
  it("raw regex is case sensitive (callers uppercase before testing)", () => {
    expect(IFSC_REGEX.test("hdfc0001234")).toBe(false);
  });
});

describe("isValidAccountNumber", () => {
  it("enforces the 6-20 digit boundary", () => {
    expect(isValidAccountNumber("12345")).toBe(false);
    expect(isValidAccountNumber("123456")).toBe(true);
    expect(isValidAccountNumber("1".repeat(20))).toBe(true);
    expect(isValidAccountNumber("1".repeat(21))).toBe(false);
  });
  it("trims outer whitespace but rejects inner spaces, letters, signs and non-ASCII digits", () => {
    expect(isValidAccountNumber(" 123456789 ")).toBe(true);
    expect(isValidAccountNumber("1234 56789")).toBe(false);
    expect(isValidAccountNumber("12345678A")).toBe(false);
    expect(isValidAccountNumber("-123456789")).toBe(false);
    expect(isValidAccountNumber("١٢٣٤٥٦٧٨٩")).toBe(false);
    expect(isValidAccountNumber("")).toBe(false);
  });
  it("regex is anchored", () => {
    expect(ACCOUNT_NUMBER_REGEX.test("123456\nabc")).toBe(false);
  });
});

describe("isValidUpi", () => {
  it.each(["name@okhdfcbank", "a.b-c_d@ybl", "98765@paytm", "AB@UPI", " x1@axl "])("accepts %j", (v) =>
    expect(isValidUpi(v)).toBe(true),
  );
  it.each(["", "name", "@ybl", "n@ybl", "name@y", "name@ok1bank", "name@@ybl", "na me@ybl", "name@ybl.com", "name@" + "a".repeat(65)])(
    "rejects %j",
    (v) => expect(isValidUpi(v)).toBe(false),
  );
  it("accepts handle length boundaries 2 and 64", () => {
    expect(UPI_REGEX.test("ab@" + "a".repeat(64))).toBe(true);
    expect(UPI_REGEX.test("ab@ab")).toBe(true);
  });
});
