import jsPDF from "jspdf";

const SCALE = 2;

async function rasterize(selector: string): Promise<HTMLCanvasElement | null> {
  const html2canvas = (await import("html2canvas")).default;
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) return null;
  return html2canvas(el, { scale: SCALE, backgroundColor: "#ffffff", useCORS: true, logging: false });
}

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
//
// `headerSelector`/`footerSelector` are also additive opt-ins: the header is
// captured separately and placed only on page 1; the footer is captured
// separately and pinned to the fixed bottom margin of EVERY page (including
// a single-page result), with the body's available height reduced
// accordingly so nothing overlaps it. `rowSelector` (matching each atomic
// row inside `selector`, e.g. one medicine) lets a multi-page break point
// snap to a row boundary instead of slicing mid-row, when one is close
// enough to the natural break — if omitted, or no boundary is close enough,
// it falls back to the plain mechanical cut.
export async function downloadPdfFromNode(
  selector: string,
  filename: string,
  options?: { multiPage?: boolean; headerSelector?: string; footerSelector?: string; rowSelector?: string }
): Promise<void> {
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  const canvas = await rasterize(selector);
  if (!canvas) return;

  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 24;
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;
  const ratio = canvas.width / canvas.height;

  const headerCanvas = options?.headerSelector ? await rasterize(options.headerSelector) : null;
  const footerCanvas = options?.footerSelector ? await rasterize(options.footerSelector) : null;
  const headerHPt = headerCanvas ? (headerCanvas.height / headerCanvas.width) * maxW : 0;
  const footerHPt = footerCanvas ? (footerCanvas.height / footerCanvas.width) * maxW : 0;
  const bodyHPtAtFullWidth = maxW / ratio;

  const fitsOnOnePage = !options?.multiPage || headerHPt + bodyHPtAtFullWidth + footerHPt <= maxH;

  if (fitsOnOnePage) {
    if (!headerCanvas && !footerCanvas) {
      // No header/footer selectors given — original single-image behavior,
      // unchanged: shrink-to-fit and center on the page.
      let w = maxW;
      let h = w / ratio;
      if (h > maxH) { h = maxH; w = h * ratio; }
      const x = (pageW - w) / 2;
      const y = (pageH - h) / 2;
      doc.addImage(canvas.toDataURL("image/png"), "PNG", x, y, w, h);
      doc.save(filename);
      return;
    }
    // Header at top, footer pinned to the fixed bottom margin, body in
    // between at full width (already established to fit above).
    let cursorY = margin;
    if (headerCanvas) {
      doc.addImage(headerCanvas.toDataURL("image/png"), "PNG", margin, cursorY, maxW, headerHPt);
      cursorY += headerHPt;
    }
    doc.addImage(canvas.toDataURL("image/png"), "PNG", margin, cursorY, maxW, bodyHPtAtFullWidth);
    if (footerCanvas) {
      doc.addImage(footerCanvas.toDataURL("image/png"), "PNG", margin, pageH - margin - footerHPt, maxW, footerHPt);
    }
    doc.save(filename);
    return;
  }

  // Content is taller than one page. Row-start Y positions in body-canvas
  // pixel space, used to avoid cutting a row in half at a page boundary.
  let rowStartsPx: number[] = [];
  if (options?.rowSelector) {
    const bodyEl = document.querySelector(selector) as HTMLElement | null;
    if (bodyEl) {
      const bodyTop = bodyEl.getBoundingClientRect().top;
      rowStartsPx = Array.from(document.querySelectorAll(options.rowSelector))
        .map((r) => (r.getBoundingClientRect().top - bodyTop) * SCALE)
        .filter((y) => y > 0);
    }
  }

  // Prefer the last row boundary inside (fromPx, idealToPx] so the row that
  // would otherwise straddle the break moves entirely onto the next page.
  // Falls back to the mechanical cut if no boundary is close enough (a
  // boundary far from the ideal cut would waste most of the page).
  const findCut = (fromPx: number, idealToPx: number): number => {
    const candidates = rowStartsPx.filter((y) => y > fromPx && y <= idealToPx);
    if (candidates.length === 0) return idealToPx;
    const snapped = Math.max(...candidates);
    return snapped - fromPx > (idealToPx - fromPx) * 0.5 ? snapped : idealToPx;
  };

  const pxPerPt = canvas.width / maxW;
  const chunks: Array<{ y: number; h: number }> = [];
  let sliceY = 0;
  let pageIndex = 0;
  while (sliceY < canvas.height && pageIndex < 100) {
    const availablePt = maxH - (pageIndex === 0 ? headerHPt : 0) - footerHPt;
    const idealCut = Math.min(sliceY + Math.max(1, availablePt * pxPerPt), canvas.height);
    const cut = idealCut >= canvas.height ? canvas.height : findCut(sliceY, idealCut);
    chunks.push({ y: sliceY, h: Math.max(1, cut - sliceY) });
    sliceY = cut;
    pageIndex++;
  }

  const sliceCanvas = document.createElement("canvas");
  sliceCanvas.width = canvas.width;
  const ctx = sliceCanvas.getContext("2d");
  if (!ctx) return;

  chunks.forEach((chunk, i) => {
    if (i > 0) doc.addPage();
    let cursorY = margin;
    if (i === 0 && headerCanvas) {
      doc.addImage(headerCanvas.toDataURL("image/png"), "PNG", margin, cursorY, maxW, headerHPt);
      cursorY += headerHPt;
    }
    sliceCanvas.height = chunk.h;
    ctx.clearRect(0, 0, canvas.width, chunk.h);
    ctx.drawImage(canvas, 0, chunk.y, canvas.width, chunk.h, 0, 0, canvas.width, chunk.h);
    const chunkHPt = (chunk.h / canvas.width) * maxW;
    doc.addImage(sliceCanvas.toDataURL("image/png"), "PNG", margin, cursorY, maxW, chunkHPt);
    if (footerCanvas) {
      doc.addImage(footerCanvas.toDataURL("image/png"), "PNG", margin, pageH - margin - footerHPt, maxW, footerHPt);
    }
  });
  doc.save(filename);
}
