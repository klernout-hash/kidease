import { parseCompareSlugs } from "@/lib/now-loops";

const KEY = "kidease-compare";
const MAX = 5;

export type CompareEntry = { id: string; slug: string };

function asEntry(raw: unknown): CompareEntry | null {
  if (typeof raw === "string" && raw.trim()) {
    return { id: raw.trim(), slug: raw.trim() };
  }
  if (raw && typeof raw === "object") {
    const id = String((raw as { id?: unknown }).id || "").trim();
    const slug = String((raw as { slug?: unknown }).slug || id).trim();
    if (id) return { id, slug };
  }
  return null;
}

export function readCompareEntries(): CompareEntry[] {
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
      if (out.length >= MAX) break;
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

export function writeCompareEntries(items: CompareEntry[]) {
  window.localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX)));
  window.dispatchEvent(new Event("kidease-compare"));
}

export function writeCompare(ids: string[]) {
  writeCompareEntries(ids.map((id) => ({ id, slug: id })));
}

export function hasCompare(id: string, slug?: string) {
  return readCompareEntries().some((item) => item.id === id || (slug && item.slug === slug));
}

export function toggleCompareItem(item: CompareEntry): CompareEntry[] {
  const cur = readCompareEntries();
  const next = cur.some((row) => row.id === item.id || row.slug === item.slug)
    ? cur.filter((row) => row.id !== item.id && row.slug !== item.slug)
    : cur.length >= MAX
      ? cur
      : [...cur, item];
  writeCompareEntries(next);
  return next;
}

export function toggleCompare(id: string): string[] {
  toggleCompareItem({ id, slug: id });
  return readCompare();
}

export function clearCompare() {
  writeCompareEntries([]);
}

export function compareKeysFromSearch(slugs: string[] | string | undefined, fallbackIds: string[]) {
  const fromUrl = parseCompareSlugs(Array.isArray(slugs) ? slugs.join(",") : slugs);
  return fromUrl.length ? fromUrl : fallbackIds;
}
