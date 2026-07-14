import jsPDF from "jspdf";

export type InvoicePayload = {
  invoice_number: string;
  created_at: string;
  patient_name: string;
  service_name: string;
  amount: number;
  gst_rate: number;
  gst_amount: number;
  total_amount: number;
  clinic_gstin?: string | null;
  doctor_name: string;
  clinic_name?: string | null;
  clinic_address?: string | null;
  clinic_phone?: string | null;
  gst_registered: boolean;
};

export const generateInvoicePDF = (inv: InvoicePayload) => {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  let y = 50;

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(13, 27, 110);
  doc.text("TAX INVOICE", W / 2, y, { align: "center" });
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text("Generated via Doctylia", W / 2, y, { align: "center" });
  y += 24;

  // Doctor / Clinic block
  doc.setDrawColor(230);
  doc.line(40, y, W - 40, y);
  y += 18;
  doc.setTextColor(20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`Dr. ${inv.doctor_name}`, 40, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  if (inv.clinic_name) { y += 14; doc.text(inv.clinic_name, 40, y); }
  if (inv.clinic_address) {
    const lines = doc.splitTextToSize(inv.clinic_address, 280);
    y += 12;
    doc.text(lines, 40, y);
    y += (lines.length - 1) * 12;
  }
  if (inv.clinic_phone) { y += 12; doc.text(`Phone: ${inv.clinic_phone}`, 40, y); }
  if (inv.gst_registered && inv.clinic_gstin) {
    y += 12;
    doc.text(`GSTIN: ${inv.clinic_gstin}`, 40, y);
  }

  // Invoice meta (right)
  let ry = y - (inv.clinic_address ? 26 : 14);
  doc.setFont("helvetica", "bold");
  doc.text("Invoice #:", W - 200, ry);
  doc.setFont("helvetica", "normal");
  doc.text(inv.invoice_number, W - 120, ry);
  ry += 14;
  doc.setFont("helvetica", "bold");
  doc.text("Date:", W - 200, ry);
  doc.setFont("helvetica", "normal");
  doc.text(new Date(inv.created_at).toLocaleDateString("en-IN"), W - 120, ry);

  y += 26;
  doc.line(40, y, W - 40, y);
  y += 20;

  // Bill To
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Bill To:", 40, y);
  doc.setFont("helvetica", "normal");
  y += 14;
  doc.text(inv.patient_name, 40, y);
  y += 24;

  // Table header
  doc.setFillColor(21, 101, 192);
  doc.rect(40, y, W - 80, 24, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.text("Description", 50, y + 16);
  doc.text("Amount (INR)", W - 130, y + 16);
  y += 24;
  doc.setTextColor(20);
  doc.setFont("helvetica", "normal");

  const rowLine = (label: string, amount: number, bold = false) => {
    if (bold) doc.setFont("helvetica", "bold");
    doc.text(label, 50, y + 16);
    doc.text(amount.toFixed(2), W - 50, y + 16, { align: "right" });
    doc.setFont("helvetica", "normal");
    y += 22;
    doc.setDrawColor(240);
    doc.line(40, y, W - 40, y);
  };
  rowLine(inv.service_name, inv.amount);
  if (inv.gst_registered && inv.gst_rate > 0) {
    rowLine(`GST @ ${inv.gst_rate}%`, inv.gst_amount);
  } else {
    doc.setTextColor(120);
    doc.text("GST Not Applicable", 50, y + 16);
    doc.setTextColor(20);
    y += 22;
    doc.line(40, y, W - 40, y);
  }
  y += 4;
  rowLine("Total", inv.total_amount, true);

  y += 30;
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text("Thank you for choosing our care.", 40, y);
  doc.text("This is a system-generated invoice.", 40, y + 12);

  doc.save(`${inv.invoice_number}.pdf`);
};
