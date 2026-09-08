/** Coerce a date-like value (ISO string, Date, epoch) to milliseconds for sorting. */
export function sortTime(value: unknown): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : 0;
  }
  const t = Date.parse(String(value));
  return Number.isFinite(t) ? t : 0;
}

/** Newest first. Never throws — Dates, numbers, strings, and nulls are all comparable. */
export function compareTimeDesc(a: unknown, b: unknown): number {
  return sortTime(b) - sortTime(a);
}

/** Normalize pg/neon timestamps so callers always get a string or null. */
export function asIsoString(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? value.toISOString() : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  const t = Date.parse(String(value));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
