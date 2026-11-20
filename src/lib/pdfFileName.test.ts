import { describe, expect, it } from "vitest";
import { pdfFileName } from "./pdfFileName";

describe("pdfFileName", () => {
  it("joins the kind, patient name and date", () => {
    expect(pdfFileName("Prescription", "Aaryan", "2026-11-18")).toBe("Prescription_Aaryan_2026-11-18.pdf");
    expect(pdfFileName("Appointment", "Ravi Kumar", "2026-11-20", "AB12CDE")).toBe("Appointment_Ravi-Kumar_2026-11-20_AB12CDE.pdf");
  });
  it("removes characters that break file names and keeps non-English names", () => {
    expect(pdfFileName("Prescription", 'A/B: "C"?*', "2026-11-18")).toBe("Prescription_A-B-C_2026-11-18.pdf");
    expect(pdfFileName("Prescription", "राहुल शर्मा", "2026-11-18")).toBe("Prescription_राहुल-शर्मा_2026-11-18.pdf");
  });
  it("shortens very long names and survives missing parts", () => {
    expect(pdfFileName("Prescription", "x".repeat(200), "2026-11-18").length).toBeLessThan(80);
    expect(pdfFileName("Prescription", "", null)).toBe("Prescription.pdf");
    expect(pdfFileName("", "", "")).toBe("document.pdf");
  });
});
