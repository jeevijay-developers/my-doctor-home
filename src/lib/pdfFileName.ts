// Names for downloaded PDFs: "Prescription_Aaryan_2026-11-18.pdf" instead of an internal id,
// so a patient or doctor can find the file later.

const MAX_NAME_CHARS = 40;

// Keeps letters from any script (Hindi, Tamil ...), digits and hyphens; everything the file
// systems or chat apps dislike becomes a hyphen.
const safePart = (raw: string | null | undefined) =>
  (raw ?? "")
    .normalize("NFC")
    .replace(/[\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_NAME_CHARS)
    .replace(/-+$/g, "");

export function pdfFileName(kind: string, patientName: string | null | undefined, date: string | null | undefined, extra?: string | null): string {
  const parts = [safePart(kind), safePart(patientName), safePart(date), safePart(extra)].filter(Boolean);
  return `${parts.join("_") || "document"}.pdf`;
}
