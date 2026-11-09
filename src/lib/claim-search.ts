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

/** Drop spaces and apostrophes so "DayCare" matches "Day Care". */
export function foldClaimText(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’‘]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

export function claimListingScore(
  query: string,
  listing: { id: string; name: string; address?: string | null; postalCode?: string | null; licenseNumber?: string | null; city?: string | null },
): number {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return 0;
  const id = (listing.id || "").toLowerCase();
  const name = (listing.name || "").toLowerCase();
  const foldedQ = foldClaimText(q);
  const foldedName = foldClaimText(name);
  if (id && id === q) return 110;
  if (name.startsWith(q) || (foldedQ && foldedName.startsWith(foldedQ))) return 100;
  if (name.includes(q) || (foldedQ.length >= 2 && foldedName.includes(foldedQ))) return 80;
  const city = claimCityScore(q, listing.city || "");
  if (city) return city;
  const addr = (listing.address || "").toLowerCase();
  if (addr.includes(q)) return 40;
  const lic = (listing.licenseNumber || "").toLowerCase();
  const tail = id.split("-").pop() || "";
  if ((lic && (lic.includes(q) || lic.endsWith(q))) || (tail && (q === tail || q.endsWith(tail)))) return 30;
  const postal = (listing.postalCode || "").toLowerCase();
  if (postal.includes(q)) return 20;
  return 0;
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
