import jsPDF from "jspdf";

// Rasterizes the DOM node matched by `selector` and embeds it as a single
// image filling one A4 page — used by every "download this styled card as a
// PDF" feature (appointment slips, payment receipts, prescription slips) so
// there is exactly one implementation of this pattern, not one per feature.
export async function downloadPdfFromNode(selector: string, filename: string): Promise<void> {
  const html2canvas = (await import("html2canvas")).default;
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) return;
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
  const imgData = canvas.toDataURL("image/png");
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 24;
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;
  const ratio = canvas.width / canvas.height;
  let w = maxW;
  let h = w / ratio;
  if (h > maxH) { h = maxH; w = h * ratio; }
  const x = (pageW - w) / 2;
  const y = (pageH - h) / 2;
  doc.addImage(imgData, "PNG", x, y, w, h);
  doc.save(filename);
}
