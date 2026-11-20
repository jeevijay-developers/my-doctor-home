import { describe, expect, it } from "vitest";
import {
  MAX_DOCUMENT_BYTES, MAX_RAW_IMAGE_BYTES, defaultDocumentDate, documentFileProblem, prepareImage, sniffMime, suggestDocumentType,
} from "./patientDocuments";

const blobOf = (bytes: number[]) => new Blob([new Uint8Array(bytes)]);

describe("sniffMime", () => {
  it("recognises PDF, JPEG, PNG and WebP by their first bytes", async () => {
    expect(await sniffMime(blobOf([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe("application/pdf");
    expect(await sniffMime(blobOf([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(await sniffMime(blobOf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe("image/png");
    expect(await sniffMime(blobOf([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe("image/webp");
  });
  it("rejects anything else, whatever the extension says", async () => {
    expect(await sniffMime(blobOf([0x4d, 0x5a, 0x90, 0x00]))).toBeNull(); // a Windows program
    expect(await sniffMime(blobOf([]))).toBeNull();
  });
});

describe("suggestDocumentType", () => {
  it.each([
    ["chest_xray_2024.jpg", "xray"],
    ["Brain-MRI.pdf", "mri"],
    ["CT scan head.png", "ct_scan"],
    ["USG abdomen.pdf", "ultrasound"],
    ["ECG-final.jpg", "ecg"],
    ["Discharge summary.pdf", "discharge_summary"],
    ["old rx.jpg", "previous_prescription"],
    ["CBC blood test.pdf", "lab_report"],
    ["IMG_2031.jpg", "other"],
  ])("%s -> %s", (name, type) => expect(suggestDocumentType(name)).toBe(type));
});

describe("defaultDocumentDate", () => {
  const now = new Date("2026-11-20T08:00:00Z");
  it("uses the file's own date when it is sensible", () => {
    expect(defaultDocumentDate({ lastModified: new Date("2021-03-05T10:00:00Z").getTime() }, now)).toBe("2021-03-05");
  });
  it("falls back to today for a missing, future or absurd date", () => {
    expect(defaultDocumentDate({}, now)).toBe("2026-11-20");
    expect(defaultDocumentDate({ lastModified: new Date("2030-01-01T00:00:00Z").getTime() }, now)).toBe("2026-11-20");
    expect(defaultDocumentDate({ lastModified: 0 }, now)).toBe("2026-11-20");
  });
});

describe("documentFileProblem", () => {
  it("accepts a normal PDF and image", () => {
    expect(documentFileProblem({ name: "a.pdf", size: 1000 }, "application/pdf")).toBeNull();
    expect(documentFileProblem({ name: "a.jpg", size: 20 * 1024 * 1024 }, "image/jpeg")).toBeNull(); // shrunk later
  });
  it("explains each refusal", () => {
    expect(documentFileProblem({ name: "a.exe", size: 10 }, null)).toMatch(/only PDF, JPG, PNG or WebP/);
    expect(documentFileProblem({ name: "a.pdf", size: 0 }, "application/pdf")).toMatch(/empty/);
    expect(documentFileProblem({ name: "big.pdf", size: MAX_DOCUMENT_BYTES + 1 }, "application/pdf")).toMatch(/at most 10 MB/);
    expect(documentFileProblem({ name: "huge.jpg", size: MAX_RAW_IMAGE_BYTES + 1 }, "image/jpeg")).toMatch(/too large/);
  });
});

describe("prepareImage", () => {
  it("returns small files and PDFs untouched", async () => {
    const small = new File(["x"], "s.jpg", { type: "image/jpeg" });
    expect(await prepareImage(small)).toBe(small);
    const pdf = new File([new Uint8Array(3 * 1024 * 1024)], "r.pdf", { type: "application/pdf" });
    expect(await prepareImage(pdf)).toBe(pdf);
  });
  it("falls back to the original when the browser can't decode it", async () => {
    const big = new File([new Uint8Array(3 * 1024 * 1024)], "p.jpg", { type: "image/jpeg" });
    expect(await prepareImage(big)).toBe(big); // jsdom has no createImageBitmap
  });
});
