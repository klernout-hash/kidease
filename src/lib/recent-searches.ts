/** Recent place searches stay on this phone. Nothing is sent to KidEase. */

export type RecentSearch = { label: string; at: string };

const STORAGE_KEY = "kidease-recent-searches";
const LIMIT = 5;

export function rememberSearch(current: readonly RecentSearch[], label: string, at = new Date().toISOString()): RecentSearch[] {
  const clean = label.trim().replace(/\s+/g, " ").slice(0, 80);
  if (clean.length < 2) return [...current];
  const next = [{ label: clean, at }, ...current.filter((item) => item.label.toLowerCase() !== clean.toLowerCase())];
  return next.slice(0, LIMIT);
}

export function readRecentSearches(): RecentSearch[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const label = "label" in item && typeof item.label === "string" ? item.label : "";
      const at = "at" in item && typeof item.at === "string" ? item.at : "";
      return rememberSearch([], label, at || new Date(0).toISOString()).slice(0, 1);
    }).slice(0, LIMIT);
  } catch {
    return [];
  }
}

export function writeRecentSearches(items: readonly RecentSearch[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, LIMIT)));
  } catch {
    /* private mode */
  }
}
