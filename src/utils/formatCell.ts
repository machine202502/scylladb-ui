/** Grouped digits for table readability (e.g. 2 147 483 647). */
function formatTableNumber(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (Number.isInteger(n)) {
    return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n);
  }
  return new Intl.NumberFormat("fr-FR", { maximumSignificantDigits: 15 }).format(n);
}

export function formatCell(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") return JSON.stringify(v);
  if (typeof v === "number" && Number.isFinite(v) && Number.isInteger(v)) {
    return formatTableNumber(v);
  }
  if (typeof v === "number") return String(v);
  return String(v);
}
