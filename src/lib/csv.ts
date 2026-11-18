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

/**
 * Minimal RFC 4180 parser: quoted cells, doubled quotes, line breaks inside quotes, CRLF/LF/CR, a
 * leading BOM. The delimiter (comma, semicolon or tab) is sniffed from the first line, because
 * Excel in some locales saves "CSV" with semicolons. Fully blank lines are dropped.
 */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const firstLine = text.split(/\r\n|\n|\r/, 1)[0] ?? "";
  const count = (ch: string) => {
    let n = 0, quoted = false;
    for (const c of firstLine) { if (c === '"') quoted = !quoted; else if (c === ch && !quoted) n++; }
    return n;
  };
  const delimiter = ([",", ";", "\t"] as const).reduce((best, d) => (count(d) > count(best) ? d : best), ",");

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const endCell = () => { row.push(cell); cell = ""; };
  const endRow = () => {
    endCell();
    if (row.some((c) => c.trim() !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false;
      } else cell += c;
    } else if (c === '"' && cell === "") inQuotes = true;
    else if (c === delimiter) endCell();
    else if (c === "\n") endRow();
    else if (c === "\r") { if (text[i + 1] === "\n") i++; endRow(); }
    else cell += c;
  }
  if (cell !== "" || row.length) endRow();
  return rows;
}
