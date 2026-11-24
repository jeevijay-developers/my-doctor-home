/** Splits "6 yrs" / "5.0" / "1,200+" into the number and the text around it (for count-up). */
const NUMBER = /\d[\d,]*(?:\.\d+)?/;

export function parseCount(text: string) {
  const match = text.match(NUMBER);
  if (!match || match.index === undefined) return null;
  const raw = match[0];
  const value = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
  const grouped = raw.includes(",");
  const locale = /\d,\d{2},/.test(raw) ? "en-IN" : "en-US";
  return {
    prefix: text.slice(0, match.index),
    suffix: text.slice(match.index + raw.length),
    value,
    format: (n: number) =>
      grouped
        ? n.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
        : n.toFixed(decimals),
  };
}
