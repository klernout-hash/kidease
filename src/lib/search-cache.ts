import type { DaycareCard } from "@/lib/types";

const KEY = "kidease-search-cache";

export function searchCacheKey(input: {
  lat: number;
  lng: number;
  radiusKm: number;
  sort: string;
  ageGroup: string;
  startDate?: string | null;
  lat2?: number;
  lng2?: number;
  mode?: string;
}) {
  return [
    input.lat.toFixed(3),
    input.lng.toFixed(3),
    input.radiusKm,
    input.sort,
    input.ageGroup,
    input.startDate || "",
    input.mode || "home",
    typeof input.lat2 === "number" ? input.lat2.toFixed(3) : "",
    typeof input.lng2 === "number" ? input.lng2.toFixed(3) : "",
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
    if (Date.now() - env.at > 60_000) return null;
    return env.rows;
  } catch {
    return null;
  }
}

export function writeSearchCache(key: string, rows: DaycareCard[]) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ key, at: Date.now(), rows }));
  } catch {
    /* quota */
  }
}

export function clearSearchCache() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
