// Rules for files a clinic attaches to a patient's record (reports, scans, old prescriptions).
// Kept here, away from the UI, so they can be tested and the browser and the storage bucket
// (see the patient_document_types_and_limits migration) agree on the same limits.
import { clinicToday } from "./queue";

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
// A phone photo can be 15 MB+. Anything up to this is accepted and shrunk to fit.
export const MAX_RAW_IMAGE_BYTES = 40 * 1024 * 1024;
export const MAX_BATCH_FILES = 20;
const SHRINK_ABOVE_BYTES = 1.5 * 1024 * 1024;
const MAX_IMAGE_SIDE = 2400;

export const ACCEPTED_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export const ACCEPTED_EXTENSIONS = ".pdf,.jpg,.jpeg,.png,.webp";

export const DOCUMENT_TYPE_LABEL: Record<string, string> = {
  lab_report: "Lab Report",
  xray: "X-Ray",
  mri: "MRI",
  ct_scan: "CT Scan",
  ultrasound: "Ultrasound",
  ecg: "ECG",
  previous_prescription: "Previous Prescription",
  discharge_summary: "Discharge Summary",
  other: "Other",
};

/** The real type from the file's first bytes, so a renamed .exe can't pass as a PDF. */
export async function sniffMime(file: Blob): Promise<(typeof ACCEPTED_MIME)[number] | null> {
  const b = new Uint8Array(
    await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file.slice(0, 12));
    }),
  );
  const at = (i: number, ...v: number[]) => v.every((x, k) => b[i + k] === x);
  if (at(0, 0x25, 0x50, 0x44, 0x46)) return "application/pdf"; // %PDF
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp"; // RIFF....WEBP
  return null;
}

/** A first guess at the document type from its file name; the doctor can change it. */
export function suggestDocumentType(fileName: string): string {
  const n = fileName.toLowerCase().replace(/[_\-.]+/g, " ");
  if (/\b(x ?ray|xray|radiograph|chest pa)\b/.test(n)) return "xray";
  if (/\bmri\b/.test(n)) return "mri";
  if (/\b(ct|cat scan|ct scan)\b/.test(n)) return "ct_scan";
  if (/\b(usg|ultrasound|sonography|sonogram)\b/.test(n)) return "ultrasound";
  if (/\b(ecg|ekg|echo)\b/.test(n)) return "ecg";
  if (/\bdischarge\b/.test(n)) return "discharge_summary";
  if (/\b(rx|prescription)\b/.test(n)) return "previous_prescription";
  if (/\b(lab|blood|cbc|lft|kft|thyroid|urine|sugar|hba1c|pathology|report)\b/.test(n)) return "lab_report";
  return "other";
}

/** The file's own date (clinic time) when it is sensible, otherwise today. */
export function defaultDocumentDate(file: { lastModified?: number }, now: Date = new Date()): string {
  const today = clinicToday(now);
  if (!file.lastModified) return today;
  const d = clinicToday(new Date(file.lastModified));
  return d > today || d < "1990-01-01" ? today : d;
}

export const baseName = (fileName: string) => fileName.replace(/\.[^.]+$/, "");

/** Why this file can't be attached, or null if it can. `mime` is the sniffed type. */
export function documentFileProblem(file: { name: string; size: number }, mime: string | null): string | null {
  if (!mime) return `${file.name}: only PDF, JPG, PNG or WebP files can be added`;
  if (file.size === 0) return `${file.name}: the file is empty`;
  if (mime === "application/pdf" && file.size > MAX_DOCUMENT_BYTES) {
    return `${file.name}: PDFs can be at most ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB`;
  }
  if (mime !== "application/pdf" && file.size > MAX_RAW_IMAGE_BYTES) return `${file.name}: the photo is too large`;
  return null;
}

/**
 * Large phone photos are scaled down and re-saved as JPEG before upload so they fit the limit
 * and don't fill the clinic's storage. Falls back to the original if the browser can't do it.
 */
export async function prepareImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= SHRINK_ABOVE_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff"; // JPEG has no transparency
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${baseName(file.name)}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  }
}
