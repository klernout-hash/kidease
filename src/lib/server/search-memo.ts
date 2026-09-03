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
}) {
  return [
    input.lat.toFixed(3),
    input.lng.toFixed(3),
    Math.round(input.radiusKm),
    input.sort,
    input.ageGroup,
    input.fsa || "",
  ].join(":");
}

export async function rememberSearch<T>(key: string, build: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as Entry<T> | undefined;
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = await build();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (typeof oldest === "string") cache.delete(oldest);
  }
  return value;
}
