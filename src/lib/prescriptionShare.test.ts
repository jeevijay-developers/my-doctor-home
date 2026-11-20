import { describe, it, expect } from "vitest";
import { whatsappNumber, buildWhatsAppUrl, buildShareMessage, prescriptionShareUrl } from "./prescriptionShare";

describe("prescriptionShare", () => {
  it("turns an Indian mobile into a wa.me number", () => {
    expect(whatsappNumber("98765 43210")).toBe("919876543210");
    expect(whatsappNumber("+91 98765-43210")).toBe("919876543210");
    expect(whatsappNumber("09876543210")).toBe("919876543210");
  });
  it("keeps a plausible international number and rejects junk", () => {
    expect(whatsappNumber("+44 7911 123456")).toBe("447911123456");
    expect(whatsappNumber("12345")).toBeNull();
    expect(whatsappNumber("")).toBeNull();
    expect(whatsappNumber(null)).toBeNull();
  });
  it("builds the chat link with the encoded message, and still works without a number", () => {
    const msg = buildShareMessage({ patientName: "Asha", doctorName: "Rao", link: prescriptionShareUrl("https://x.in", "tok") });
    expect(msg).toContain("https://x.in/rx/tok");
    const url = buildWhatsAppUrl("9876543210", msg);
    expect(url.startsWith("https://wa.me/919876543210?text=")).toBe(true);
    expect(decodeURIComponent(url.split("?text=")[1])).toBe(msg);
    expect(buildWhatsAppUrl("bad", msg).startsWith("https://wa.me/?text=")).toBe(true);
  });
});
