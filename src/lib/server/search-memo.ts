const TTL_MS = 60_000;
const MAX_ENTRIES = 80;

type Entry<T> = { at: number; value: T };

const cache = new Map<string, Entry<unknown>>();

export function searchMemoKey(input: {
  lat: number;
  lng: number;
  radiusKm: number;
  sort: string;
  ageGroup: string;
  fsa?: string;
  label?: string;
  q?: string;
  startDate?: string | null;
  lat2?: number;
  lng2?: number;
  mode?: string;
}) {
  return [
    input.lat.toFixed(3),
    input.lng.toFixed(3),
    Math.round(input.radiusKm),
    input.sort,
    input.ageGroup,
    input.fsa || "",
    input.label || "",
    input.q || "",
    input.startDate || "",
    input.mode || "home",
    typeof input.lat2 === "number" ? input.lat2.toFixed(3) : "",
    typeof input.lng2 === "number" ? input.lng2.toFixed(3) : "",
    "l2",
  ].join(":");
}

export function readFreshSearch<T>(key: string): T | null {
  const hit = cache.get(key) as Entry<T> | undefined;
  if (!hit || Date.now() - hit.at >= TTL_MS) return null;
  return hit.value;
}

export function writeFreshSearch<T>(key: string, value: T) {
  // An empty timeout fallback must not stick for 60s and report "0 live".
  if (Array.isArray(value) && value.length === 0) {
    cache.delete(key);
    return;
  }
  cache.set(key, { at: Date.now(), value });
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (typeof oldest === "string") cache.delete(oldest);
  }
}

export async function rememberSearch<T>(key: string, build: () => Promise<T>): Promise<T> {
  const hit = readFreshSearch<T>(key);
  if (hit !== null) return hit;
  const value = await build();
  writeFreshSearch(key, value);
  return value;
}

/** Drop every memoized search so a just-approved live listing is not hidden for 60s. */
export function flushSearchMemo() {
  cache.clear();
}
