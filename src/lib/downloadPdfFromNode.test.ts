// Logic of the shared "download this card as a PDF" helper (appointment slip, payment receipt,
// prescription). jsPDF and html2canvas are replaced by recorders; what is asserted is the
// pagination arithmetic, header/footer placement and row-boundary snapping.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const pdf = vi.hoisted(() => ({
  addImage: vi.fn(),
  addPage: vi.fn(),
  save: vi.fn(),
}));
const h = vi.hoisted(() => ({
  // selector -> canvas size produced by the fake html2canvas
  sizes: {} as Record<string, { width: number; height: number }>,
}));

vi.mock("jspdf", () => ({
  default: class {
    internal = { pageSize: { getWidth: () => 595.28, getHeight: () => 841.89 } };
    addImage = pdf.addImage;
    addPage = pdf.addPage;
    save = pdf.save;
  },
}));
vi.mock("html2canvas", () => ({
  default: vi.fn(async (el: HTMLElement) => {
    const size = h.sizes[el.dataset.sel ?? ""] ?? { width: 1000, height: 1000 };
    return { ...size, toDataURL: () => "data:image/png;base64,AAA" };
  }),
}));

import { downloadPdfFromNode } from "./downloadPdfFromNode";

const MAX_W = 595.28 - 48;
const MAX_H = 841.89 - 48;

const mount = (sel: string, id: string) => {
  const el = document.createElement("div");
  el.id = id;
  el.dataset.sel = id;
  document.body.appendChild(el);
  return el;
};

const drawImage = vi.fn();

describe("downloadPdfFromNode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.sizes = {};
    document.body.innerHTML = "";
    HTMLCanvasElement.prototype.getContext = (() => ({ clearRect: vi.fn(), drawImage })) as any;
    HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,SLICE";
  });
  afterEach(() => { document.body.innerHTML = ""; });

  it("does nothing (and saves no file) when the node is not in the DOM", async () => {
    await downloadPdfFromNode("#missing", "x.pdf");
    expect(pdf.save).not.toHaveBeenCalled();
    expect(pdf.addImage).not.toHaveBeenCalled();
  });

  it("puts a card that fits on one centred page and saves under the given filename", async () => {
    mount("#card", "card");
    h.sizes.card = { width: 1000, height: 1000 };
    await downloadPdfFromNode("#card", "slip.pdf");
    expect(pdf.addImage).toHaveBeenCalledTimes(1);
    const [, fmt, x, y, w, hh] = pdf.addImage.mock.calls[0];
    expect(fmt).toBe("PNG");
    expect(w).toBeCloseTo(MAX_W);
    expect(hh).toBeCloseTo(MAX_W); // square
    expect(x).toBeCloseTo(24);
    expect(y).toBeCloseTo((841.89 - MAX_W) / 2);
    expect(pdf.save).toHaveBeenCalledWith("slip.pdf");
    expect(pdf.addPage).not.toHaveBeenCalled();
  });

  it("without multiPage, shrinks a tall card to fit one page instead of paginating", async () => {
    mount("#tall", "tall");
    h.sizes.tall = { width: 1000, height: 4000 };
    await downloadPdfFromNode("#tall", "tall.pdf");
    expect(pdf.addPage).not.toHaveBeenCalled();
    const [, , , , w, hh] = pdf.addImage.mock.calls[0];
    expect(hh).toBeCloseTo(MAX_H);
    expect(w).toBeCloseTo(MAX_H / 4);
    expect(pdf.save).toHaveBeenCalledWith("tall.pdf");
  });

  it("multiPage with content taller than a page slices it into A4-height chunks that cover the whole canvas", async () => {
    mount("#long", "long");
    h.sizes.long = { width: 1000, height: 4000 };
    await downloadPdfFromNode("#long", "long.pdf", { multiPage: true });
    expect(pdf.addPage).toHaveBeenCalledTimes(2); // 3 pages
    expect(pdf.addImage).toHaveBeenCalledTimes(3);
    const slices = drawImage.mock.calls.map((c) => ({ y: c[2] as number, h: c[4] as number }));
    expect(slices).toHaveLength(3);
    expect(slices[0].y).toBe(0);
    for (let i = 1; i < slices.length; i++) expect(slices[i].y).toBeCloseTo(slices[i - 1].y + slices[i - 1].h);
    expect(slices.at(-1)!.y + slices.at(-1)!.h).toBeCloseTo(4000);
    // every chunk fits the page body
    const pxPerPt = 1000 / MAX_W;
    for (const s of slices) expect(s.h / pxPerPt).toBeLessThanOrEqual(MAX_H + 0.01);
    expect(pdf.save).toHaveBeenCalledWith("long.pdf");
  });

  it("multiPage with content that fits stays on one page", async () => {
    mount("#short", "short");
    h.sizes.short = { width: 1000, height: 1000 };
    await downloadPdfFromNode("#short", "s.pdf", { multiPage: true });
    expect(pdf.addPage).not.toHaveBeenCalled();
    expect(pdf.addImage).toHaveBeenCalledTimes(1);
    expect(pdf.save).toHaveBeenCalledOnce();
  });

  it("places the header on page 1 only and pins the footer to the bottom of EVERY page", async () => {
    mount("#body", "body"); mount("#hdr", "hdr"); mount("#ftr", "ftr");
    h.sizes.body = { width: 1000, height: 4000 };
    h.sizes.hdr = { width: 1000, height: 200 };
    h.sizes.ftr = { width: 1000, height: 100 };
    await downloadPdfFromNode("#body", "rx.pdf", { multiPage: true, headerSelector: "#hdr", footerSelector: "#ftr" });
    const pages = pdf.addPage.mock.calls.length + 1;
    expect(pages).toBeGreaterThanOrEqual(3);
    const footerH = (100 / 1000) * MAX_W;
    const headerH = (200 / 1000) * MAX_W;
    const footerCalls = pdf.addImage.mock.calls.filter((c) => Math.abs((c[3] as number) - (841.89 - 24 - footerH)) < 0.01);
    expect(footerCalls).toHaveLength(pages);
    const headerCalls = pdf.addImage.mock.calls.filter((c) => c[3] === 24 && Math.abs((c[5] as number) - headerH) < 0.01);
    expect(headerCalls).toHaveLength(1);
    // body chunks leave room for the footer (and header on page 1)
    const pxPerPt = 1000 / MAX_W;
    const slices = drawImage.mock.calls.map((c) => c[4] as number);
    expect(slices[0] / pxPerPt).toBeLessThanOrEqual(MAX_H - headerH - footerH + 0.01);
    expect(slices[1] / pxPerPt).toBeLessThanOrEqual(MAX_H - footerH + 0.01);
  });

  it("a short single-page slip with header + footer still renders both", async () => {
    mount("#body", "body"); mount("#hdr", "hdr"); mount("#ftr", "ftr");
    h.sizes.body = { width: 1000, height: 500 };
    h.sizes.hdr = { width: 1000, height: 100 };
    h.sizes.ftr = { width: 1000, height: 100 };
    await downloadPdfFromNode("#body", "rx.pdf", { multiPage: true, headerSelector: "#hdr", footerSelector: "#ftr" });
    expect(pdf.addImage).toHaveBeenCalledTimes(3);
    expect(pdf.addPage).not.toHaveBeenCalled();
    expect(pdf.save).toHaveBeenCalledWith("rx.pdf");
  });

  it("snaps the page break to a row boundary when one is close enough, so a medicine is not cut in half", async () => {
    const body = mount("#body", "body");
    h.sizes.body = { width: 1000, height: 4000 };
    body.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
    // Natural first break is at 1450px; a row starts at 650 css px (= 1300px at scale 2) -> snap there.
    for (const top of [300, 650, 900]) {
      const row = document.createElement("div");
      row.className = "row";
      row.getBoundingClientRect = () => ({ top }) as DOMRect;
      document.body.appendChild(row);
    }
    await downloadPdfFromNode("#body", "rx.pdf", { multiPage: true, rowSelector: ".row" });
    expect(drawImage.mock.calls[0][4]).toBe(1300);
    expect(drawImage.mock.calls[1][2]).toBe(1300);
  });

  it("ignores a row boundary that is too far from the natural break (would waste most of the page)", async () => {
    const body = mount("#body", "body");
    h.sizes.body = { width: 1000, height: 4000 };
    body.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
    const row = document.createElement("div");
    row.className = "row";
    row.getBoundingClientRect = () => ({ top: 100 }) as DOMRect; // 200px: < 50% of the 1450px page
    document.body.appendChild(row);
    await downloadPdfFromNode("#body", "rx.pdf", { multiPage: true, rowSelector: ".row" });
    expect(drawImage.mock.calls[0][4]).toBeGreaterThan(1449);
  });
});
