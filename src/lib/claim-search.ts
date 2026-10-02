import { normalizeCityKey } from "./city-hubs.ts";
import { CITIES } from "./geo.ts";

const PROVINCE_CODES = new Set([
  "bc",
  "ab",
  "sk",
  "mb",
  "on",
  "qc",
  "nb",
  "ns",
  "pe",
  "nl",
  "yt",
  "nt",
  "nu",
]);

function placeKeys(hit: (typeof CITIES)[number]) {
  const keys = new Set<string>();
  for (const part of hit.label.split(",")) {
    const key = normalizeCityKey(part);
    if (key && key.length > 2 && !PROVINCE_CODES.has(key)) keys.add(key);
  }
  for (const alias of hit.aliases) {
    const key = normalizeCityKey(alias);
    if (!key || key.length < 3 || /^[a-z]\d/.test(key)) continue;
    keys.add(key);
  }
  return [...keys];
}

/**
 * City names that should match a claim search.
 * "Winnipeg" also matches neighbourhoods stored on the listing (Fort Garry, St. Vital).
 */
export function claimCityKeys(query: string): string[] {
  const q = normalizeCityKey(query);
  if (q.length < 3) return [];
  const keys = new Set<string>([q]);
  for (const hit of CITIES) {
    const local = placeKeys(hit);
    const label = normalizeCityKey(hit.label);
    const mentions = local.some((key) => key === q) || label.split(" ").includes(q);
    if (!mentions) continue;
    for (const key of local) keys.add(key);
  }
  return [...keys];
}

/** 60 exact city, 58 city contains the query, 55 neighbourhood of that city, else 0. */
export function claimCityScore(query: string, city: string): number {
  const q = normalizeCityKey(query);
  const saved = normalizeCityKey(city);
  if (!q || !saved) return 0;
  if (saved === q) return 60;
  if (
    saved.startsWith(`${q} `) ||
    (saved.startsWith(q) && saved.length > q.length && saved[q.length] !== " ")
  ) {
    return 0;
  }
  if (saved.includes(q)) return 58;
  const keys = claimCityKeys(query);
  if (keys.includes(saved)) return 55;
  if (keys.some((key) => saved.includes(key) || (key.length > 3 && key.includes(saved)))) return 55;
  return 0;
}
