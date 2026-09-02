import type { DaycareCard } from "@/lib/types";

const KEY = "kidease-search-cache";

export function searchCacheKey(input: {
  lat: number;
  lng: number;
  radiusKm: number;
  sort: string;
  ageGroup: string;
}) {
  return [
    input.lat.toFixed(3),
    input.lng.toFixed(3),
    input.radiusKm,
    input.sort,
    input.ageGroup,
  ].join(":");
}

type Envelope = { key: string; at: number; rows: DaycareCard[] };

export function readSearchCache(key: string): DaycareCard[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const env = JSON.parse(raw) as Envelope;
    if (env.key !== key || !Array.isArray(env.rows)) return null;
    if (Date.now() - env.at > 30 * 60_000) return null;
    return env.rows;
  } catch {
    return null;
  }
}

export function writeSearchCache(key: string, rows: DaycareCard[]) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ key, at: Date.now(), rows: rows.slice(0, 80) }));
  } catch {
    /* quota */
  }
}
