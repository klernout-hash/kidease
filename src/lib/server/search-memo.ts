const TTL_MS = 3 * 60 * 1000;
const MAX_ENTRIES = 80;

type Entry<T> = { at: number; value: T };

const cache = new Map<string, Entry<unknown>>();
const pending = new Map<string, Promise<unknown>>();

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
  facility?: string;
  city?: string;
  name?: string;
}) {
  return JSON.stringify([
    input.lat,
    input.lng,
    Math.round(input.radiusKm),
    input.sort,
    input.ageGroup,
    input.fsa || "",
    input.label || "",
    input.q || "",
    input.city || "",
    (input.name || "").trim().toLowerCase(),
    input.startDate || "",
    input.mode || "home",
    input.facility || "",
    typeof input.lat2 === "number" ? input.lat2 : null,
    typeof input.lng2 === "number" ? input.lng2 : null,
  ]);
}

export async function rememberSearch<T>(key: string, build: () => Promise<T>, options?: {
  refresh?: boolean;
  cacheIf?: (value: T) => boolean;
}): Promise<T> {
  // Ordinary concurrent page/map reads share a candidate generation. An explicit
  // retry must also escape an old in-flight request, not only a cached response.
  const running = pending.get(key) as Promise<T> | undefined;
  if (running && !options?.refresh) return running;
  const hit = cache.get(key) as Entry<T> | undefined;
  if (!options?.refresh && hit && Date.now() - hit.at < TTL_MS) return hit.value;
  if (options?.refresh) cache.delete(key);
  const request = Promise.resolve().then(build);
  pending.set(key, request);
  try {
    const value = await request;
    if (pending.get(key) !== request) return value;
    // Preserve legacy empty-array behavior; typed envelopes supply their policy.
    if ((Array.isArray(value) && value.length === 0) || options?.cacheIf?.(value) === false) {
      cache.delete(key);
      return value;
    }
    cache.set(key, { at: Date.now(), value });
    if (cache.size > MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (typeof oldest === "string") cache.delete(oldest);
    }
    return value;
  } finally {
    if (pending.get(key) === request) pending.delete(key);
  }
}

/** Drop every memoized search so a just-approved live listing is not hidden. */
export function flushSearchMemo() {
  cache.clear();
  pending.clear();
}
