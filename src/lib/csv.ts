/**
 * Safe CSV cell encoding. Text that starts with = + - @ TAB or CR is a live formula when the file is
 * opened in Excel/Sheets (CSV injection), so it is prefixed with a single quote. Real numbers are left
 * alone (a refund of -100 is data, not a formula). Cells containing quotes, commas or line breaks are
 * quoted with embedded quotes doubled.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (typeof value !== "number" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",");
}
