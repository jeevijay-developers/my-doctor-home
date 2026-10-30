import { describe, expect, it } from "vitest";
import { isGoogleMapsUrl } from "./googleMapsUrl";

describe("isGoogleMapsUrl", () => {
  it.each([
    "https://maps.app.goo.gl/AbC123",
    "https://www.google.com/maps/place/Clinic/@25.18,75.83,17z",
    "https://google.co.in/maps?cid=123",
    "https://maps.google.com/?q=clinic",
    "https://g.page/my-clinic",
    "https://share.google/xyz",
    "https://business.google.com/n/123",
    "  https://maps.app.goo.gl/AbC123  ",
  ])("accepts %s", (u) => expect(isGoogleMapsUrl(u)).toBe(true));

  it.each([
    "", null, undefined,
    "http://maps.app.goo.gl/x",
    "https://evil.com/maps",
    "https://google.com.evil.com/maps",
    "https://maps.google.com.evil.com/",
    "javascript:alert(1)",
    "https://maps.app.goo.gl/has space",
    "https://www.google.com/search?q=x",
    "https://maps.app.goo.gl/" + "a".repeat(500),
  ])("rejects %s", (u) => expect(isGoogleMapsUrl(u as string)).toBe(false));
});
