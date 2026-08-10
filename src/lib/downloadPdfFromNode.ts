import jsPDF from "jspdf";

// Rasterizes the DOM node matched by `selector` and embeds it as a single
// image filling one A4 page — used by every "download this styled card as a
// PDF" feature (appointment slips, payment receipts, prescription slips) so
// there is exactly one implementation of this pattern, not one per feature.
//
// `multiPage: true` is an additive opt-in (default behavior above is
// unchanged for existing callers): instead of squashing the whole canvas
// onto one page, it slices the canvas into A4-page-height chunks and adds a
// page per chunk, so content taller than one page isn't clipped or
// squeezed — used by the prescription slip, which can have many medicines.
export async function downloadPdfFromNode(
  selector: string,
  filename: string,
  options?: { multiPage?: boolean }
): Promise<void> {
  const html2canvas = (await import("html2canvas")).default;
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) return;
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 24;
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;
  const ratio = canvas.width / canvas.height;

  if (!options?.multiPage || canvas.height / canvas.width <= maxH / maxW) {
    // Fits on one page (or multi-page wasn't requested) — original behavior.
    const imgData = canvas.toDataURL("image/png");
    let w = maxW;
    let h = w / ratio;
    if (h > maxH) { h = maxH; w = h * ratio; }
    const x = (pageW - w) / 2;
    const y = (pageH - h) / 2;
    doc.addImage(imgData, "PNG", x, y, w, h);
    doc.save(filename);
    return;
  }

  // Content is taller than one page: slice the source canvas into
  // page-height chunks (in canvas-pixel space) and add one PDF page per chunk.
  const pageWidthPx = canvas.width;
  const pageHeightPx = Math.floor((maxH / maxW) * canvas.width);
  const totalPages = Math.ceil(canvas.height / pageHeightPx);
  const sliceCanvas = document.createElement("canvas");
  sliceCanvas.width = pageWidthPx;
  const ctx = sliceCanvas.getContext("2d");
  if (!ctx) return;

  for (let page = 0; page < totalPages; page++) {
    const sliceY = page * pageHeightPx;
    const sliceHeightPx = Math.min(pageHeightPx, canvas.height - sliceY);
    sliceCanvas.height = sliceHeightPx;
    ctx.clearRect(0, 0, pageWidthPx, sliceHeightPx);
    ctx.drawImage(canvas, 0, sliceY, pageWidthPx, sliceHeightPx, 0, 0, pageWidthPx, sliceHeightPx);
    const sliceData = sliceCanvas.toDataURL("image/png");
    const h = (sliceHeightPx / pageWidthPx) * maxW;
    if (page > 0) doc.addPage();
    doc.addImage(sliceData, "PNG", margin, margin, maxW, h);
  }
  doc.save(filename);
}
