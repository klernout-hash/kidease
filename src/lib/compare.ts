import { parseCompareSlugs } from "@/lib/now-loops";

const KEY = "kidease-compare";
export const FREE_COMPARE_MAX = 5;
export const PLUS_COMPARE_MAX = 10;

export type CompareEntry = { id: string; slug: string };

export function compareLimit(paid: boolean): number {
  return paid ? PLUS_COMPARE_MAX : FREE_COMPARE_MAX;
}

function cap(): number {
  return FREE_COMPARE_MAX;
}

function asEntry(raw: unknown): CompareEntry | null {
  if (typeof raw !== "string" && raw && typeof raw === "object") {
    const id = String((raw as { id?: unknown }).id || "").trim();
    const slug = String((raw as { slug?: unknown }).slug || id).trim();
    if (id) return { id, slug };
  }
  if (typeof raw === "string" && raw.trim()) {
    return { id: raw.trim(), slug: raw.trim() };
  }
  return null;
}

export function readCompareEntries(max = cap()): CompareEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    const out: CompareEntry[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      const entry = asEntry(item);
      if (!entry || seen.has(entry.id)) continue;
      seen.add(entry.id);
      out.push(entry);
      if (out.length >= max) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** Legacy id list for existing callers. */
export function readCompare(): string[] {
  return readCompareEntries().map((item) => item.id);
}

export function readCompareSlugs(): string[] {
  return readCompareEntries().map((item) => item.slug).filter(Boolean);
}

export function writeCompareEntries(items: CompareEntry[], max = cap()) {
  window.localStorage.setItem(KEY, JSON.stringify(items.slice(0, max)));
  window.dispatchEvent(new Event("kidease-compare"));
}

export function writeCompare(ids: string[]) {
  writeCompareEntries(ids.map((id) => ({ id, slug: id })));
}

export function hasCompare(id: string, slug?: string) {
  return readCompareEntries(PLUS_COMPARE_MAX).some((item) => item.id === id || (slug && item.slug === slug));
}

export function toggleCompareItem(item: CompareEntry, paid = false): CompareEntry[] {
  const max = compareLimit(paid);
  const cur = readCompareEntries(max);
  const next = cur.some((row) => row.id === item.id || row.slug === item.slug)
    ? cur.filter((row) => row.id !== item.id && row.slug !== item.slug)
    : cur.length >= max
      ? cur
      : [...cur, item];
  writeCompareEntries(next, max);
  return next;
}

export function toggleCompare(id: string, paid = false): string[] {
  toggleCompareItem({ id, slug: id }, paid);
  return readCompare();
}

export function clearCompare() {
  writeCompareEntries([]);
}

export function compareKeysFromSearch(slugs: string[] | string | undefined, fallbackIds: string[]) {
  const fromUrl = parseCompareSlugs(Array.isArray(slugs) ? slugs.join(",") : slugs);
  return fromUrl.length ? fromUrl : fallbackIds;
}
