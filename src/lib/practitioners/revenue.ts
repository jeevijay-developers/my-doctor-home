import { csvRow } from "@/lib/csv";

// Payloads of get_practitioner_revenue / get_my_practitioner_revenue (aggregates only: never patient
// names, invoice numbers or payment references). Amounts are rupees; paid_amount is ex-GST.
export interface RevenueByMode { cash: number; upi: number; card: number; online: number; other: number; unrecorded: number }

export interface RevenueNumbers {
  visits_completed: number; paid_amount: number; gst_amount: number; by_mode: RevenueByMode;
  refunds_count: number; refunds_amount: number; no_shows: number;
  paid_no_shows_count: number; paid_no_shows_amount: number; platform_charge: number; net: number;
  /** net minus the refunds made in the period (refunds are listed in the month they happened). */
  net_after_refunds: number;
}
export interface RevenueRow extends RevenueNumbers { practitioner_id: string; display_name: string; is_active: boolean }

export type RevenueResult =
  | { ok: true; from: string; to: string; rows: RevenueRow[]; unattributed: RevenueNumbers; totals: RevenueNumbers }
  | { ok: false; error: string };
export type MyRevenueResult =
  | { ok: true; from: string; to: string; row: RevenueRow | null }
  | { ok: false; error: string };

/** Rupees for display: whole amounts without decimals, otherwise always 2 decimals (₹1,234.50). */
export function formatInr(n: number | null | undefined): string {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  const digits = Number.isInteger(v) ? 0 : 2;
  return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

const IST_YMD = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });

/** First and last IST calendar day ('YYYY-MM-DD') of the month containing `date`. */
export function istMonthRange(date: Date): { from: string; to: string } {
  const [y, m] = IST_YMD.format(date).split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

export const hasActivity = (n: RevenueNumbers | null | undefined): boolean =>
  !!n && (n.visits_completed > 0 || n.paid_amount !== 0 || n.gst_amount !== 0 || n.refunds_count > 0 || n.refunds_amount !== 0
    || n.no_shows > 0 || n.paid_no_shows_count > 0 || n.platform_charge !== 0 || n.net !== 0 || (n.net_after_refunds ?? 0) !== 0
    || Object.values(n.by_mode).some((v) => v !== 0));

export function revenueErrorMessage(code: string | null | undefined): string {
  switch (code) {
    case "RANGE_TOO_LARGE": return "Please choose a period of at most 366 days.";
    case "INVALID_RANGE": return "That period is not valid.";
    case "FORBIDDEN": return "You do not have access to these figures.";
    default: return "Could not load these figures. Please try again.";
  }
}

export const PAYOUT_CSV_HEADER = [
  "Doctor", "Visits", "Revenue ex-GST", "GST", "Cash", "UPI", "Card", "Online", "Refunds", "Platform charge", "Net", "Net after refunds", "Paid no-shows",
];

/** Payout sheet: one line per row, UTF-8 BOM so Excel reads the rupee names and accents correctly. */
export function payoutCsv(rows: Array<RevenueNumbers & { display_name: string }>): string {
  const lines = [csvRow(PAYOUT_CSV_HEADER)];
  for (const r of rows) {
    lines.push(csvRow([
      r.display_name, r.visits_completed, r.paid_amount, r.gst_amount,
      r.by_mode.cash, r.by_mode.upi, r.by_mode.card, r.by_mode.online,
      r.refunds_amount, r.platform_charge, r.net, r.net_after_refunds, r.paid_no_shows_amount,
    ]));
  }
  return `﻿${lines.join("\n")}`;
}
