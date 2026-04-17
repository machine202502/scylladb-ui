function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Format a JS Date in local time as `dd.mm.yyyy HH:mm:ss`. */
export function formatDateTimeLocal(d: Date): string {
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** Scylla timestamp often arrives as string millis; format it if possible. */
export function formatTimestampCell(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : formatDateTimeLocal(d);
  }
  if (typeof value === "string") {
    const s = value.trim();
    if (/^-?\d+$/.test(s)) {
      const n = Number(s);
      const d = new Date(n);
      return Number.isNaN(d.getTime()) ? null : formatDateTimeLocal(d);
    }
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : formatDateTimeLocal(d);
  }
  return null;
}

