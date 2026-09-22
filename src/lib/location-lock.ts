/**
 * Hard proximity lock. When a parent’s city/province is known, Explore,
 * Near you, age rails, directory fill, map pins, and distance sorts stay
 * inside that place. Thin local catalogue stays sparse — never backfill
 * Toronto / Vancouver / Edmonton / another province.
 */

import { cityHubPlaceKeys, CITY_HUB_DEFS, normalizeCityKey } from "./city-hubs.ts";
import { CITIES, PROVINCES, geocode, haversineKm, type LatLng } from "./geo.ts";

/** Same-province municipalities that count as the locked city’s metro. */
export const LOCATION_LOCK_METRO_KM = 40;

export type LocationLock = {
  province: string;
  city: string | null;
  metroKeys: string[];
};

export type LocationLockOrigin = Partial<LatLng> & {
  label?: string | null;
  q?: string | null;
};

export type LocationLockListing = {
  city?: string | null;
  province?: string | null;
};

const PROVINCE_BY_KEY = (() => {
  const map = new Map<string, string>();
  for (const p of PROVINCES) {
    map.set(normalizeCityKey(p.code), p.code);
    map.set(normalizeCityKey(p.name), p.code);
    map.set(normalizeCityKey(p.nameFr), p.code);
  }
  return map;
})();

export function normalizeProvinceCode(value: string | null | undefined): string {
  const key = normalizeCityKey(value);
  if (!key) return "";
  return PROVINCE_BY_KEY.get(key) || (/^[a-z]{2}$/.test(key) ? key.toUpperCase() : "");
}

function foldProvinceToken(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase();
}

/**
 * Province strings a Live-search query must treat as the same place.
 * AB and Alberta match. So do BC / British Columbia and Québec / QC.
 */
export function provinceSearchTokens(value: string | null | undefined): string[] {
  const code = normalizeProvinceCode(value);
  const tokens = new Set<string>();
  const add = (raw: string | null | undefined) => {
    const text = (raw || "").trim();
    if (!text) return;
    tokens.add(text.toUpperCase());
    tokens.add(foldProvinceToken(text));
  };
  add(value);
  add(code);
  const prov = PROVINCES.find((item) => item.code === code);
  if (prov) {
    add(prov.code);
    add(prov.name);
    add(prov.nameFr);
  }
  return [...tokens];
}

function cityNameFromLabel(label: string): string {
  return label.replace(/^near\s+/i, "").split(",")[0]?.trim() || "";
}

function cityKeysForHit(hit: (typeof CITIES)[number]): string[] {
  const keys = new Set<string>();
  const city = cityNameFromLabel(hit.label);
  if (city) keys.add(normalizeCityKey(city));
  keys.add(normalizeCityKey(hit.label));
  for (const alias of hit.aliases) {
    const key = normalizeCityKey(alias);
    if (key && key.length > 2 && !/^[a-z]\d/.test(key)) keys.add(key);
  }
  const hub = CITY_HUB_DEFS.find((item) => item.province === hit.province && cityHubPlaceKeys(item).includes(normalizeCityKey(city)));
  if (hub) {
    for (const key of cityHubPlaceKeys(hub)) keys.add(key);
  }
  return [...keys].filter(Boolean);
}

function metroKeysFor(province: string, city: string | null, origin?: LatLng | null): string[] {
  const keys = new Set<string>();
  if (city) keys.add(normalizeCityKey(city));
  const hub = CITY_HUB_DEFS.find(
    (item) => item.province === province && city && cityHubPlaceKeys(item).includes(normalizeCityKey(city)),
  );
  if (hub) {
    for (const key of cityHubPlaceKeys(hub)) keys.add(key);
  }
  const here = origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lng) ? origin : null;
  for (const hit of CITIES) {
    if (hit.province !== province) continue;
    const hitKeys = cityKeysForHit(hit);
    const sameCity = city ? hitKeys.includes(normalizeCityKey(city)) : false;
    const near = here ? haversineKm(here, hit) <= LOCATION_LOCK_METRO_KM : false;
    if (sameCity || near) {
      for (const key of hitKeys) keys.add(key);
    }
  }
  return [...keys].filter(Boolean);
}

function lockFromCityHit(hit: (typeof CITIES)[number], origin?: LatLng | null): LocationLock {
  const city = cityNameFromLabel(hit.label);
  return {
    province: hit.province,
    city,
    metroKeys: metroKeysFor(hit.province, city, origin ?? hit),
  };
}

function lockFromProvince(code: string, origin?: LatLng | null): LocationLock {
  return {
    province: code,
    city: null,
    metroKeys: metroKeysFor(code, null, origin),
  };
}

function hitFromQuery(raw?: string | null): (typeof CITIES)[number] | null {
  const q = (raw || "").trim();
  if (!q) return null;
  const geo = geocode(q);
  if (!geo) {
    const key = normalizeCityKey(q);
    return (
      CITIES.find((c) => cityKeysForHit(c).includes(key) || normalizeCityKey(c.label) === key) ?? null
    );
  }
  return (
    CITIES.find(
      (c) => Math.abs(c.lat - geo.lat) < 0.02 && Math.abs(c.lng - geo.lng) < 0.02,
    ) ??
    CITIES.find((c) => normalizeCityKey(c.label) === normalizeCityKey(geo.label)) ??
    null
  );
}

function nearestCity(origin: LatLng, maxKm = LOCATION_LOCK_METRO_KM) {
  let best: (typeof CITIES)[number] | null = null;
  let bestKm = Infinity;
  for (const c of CITIES) {
    const km = haversineKm(origin, c);
    if (km < bestKm) {
      bestKm = km;
      best = c;
    }
  }
  if (!best || bestKm > maxKm) return null;
  return best;
}

function nearestProvince(origin: LatLng) {
  let best = PROVINCES[0]!;
  let bestKm = Infinity;
  for (const p of PROVINCES) {
    const km = haversineKm(origin, p);
    if (km < bestKm) {
      bestKm = km;
      best = p;
    }
  }
  return best;
}

function isProvinceOnlyQuery(raw?: string | null): string {
  const q = (raw || "").trim();
  if (!q || q.includes(",")) return "";
  const key = normalizeCityKey(q);
  const match = PROVINCES.find(
    (p) =>
      normalizeCityKey(p.code) === key ||
      normalizeCityKey(p.name) === key ||
      normalizeCityKey(p.nameFr) === key,
  );
  return match?.code || "";
}

/** Resolve the active city + province lock from URL, saved/GPS origin, or coords. */
export function resolveLocationLock(origin: LocationLockOrigin | null | undefined): LocationLock | null {
  if (!origin) return null;
  const point =
    typeof origin.lat === "number" &&
    typeof origin.lng === "number" &&
    Number.isFinite(origin.lat) &&
    Number.isFinite(origin.lng)
      ? { lat: origin.lat, lng: origin.lng }
      : null;

  const provinceOnly = isProvinceOnlyQuery(origin.q) || (!origin.q && isProvinceOnlyQuery(origin.label));
  if (provinceOnly) return lockFromProvince(provinceOnly, point);

  const fromQuery = hitFromQuery(origin.q) || hitFromQuery(origin.label);
  if (fromQuery) return lockFromCityHit(fromQuery, point ?? fromQuery);

  const label = (origin.label || origin.q || "").trim();
  if (label) {
    const parts = label.replace(/^near\s+/i, "").split(",").map((part) => part.trim()).filter(Boolean);
    const cityPart = parts[0] || "";
    const provincePart = parts.length > 1 ? parts[parts.length - 1] : "";
    const province = normalizeProvinceCode(provincePart);
    const cityKey = normalizeCityKey(cityPart);
    if (province && cityKey) {
      const hit =
        CITIES.find((c) => c.province === province && cityKeysForHit(c).includes(cityKey)) ?? null;
      if (hit) return lockFromCityHit(hit, point ?? hit);
      return {
        province,
        city: cityNameFromLabel(cityPart),
        metroKeys: metroKeysFor(province, cityNameFromLabel(cityPart), point),
      };
    }
    if (province) return lockFromProvince(province, point);
  }

  if (point) {
    const city = nearestCity(point);
    if (city) return lockFromCityHit(city, point);
    return lockFromProvince(nearestProvince(point).code, point);
  }
  return null;
}

function knownCityOutsideLock(cityKey: string, lock: LocationLock): boolean {
  if (!cityKey) return false;
  if (lock.metroKeys.includes(cityKey)) return false;
  for (const hit of CITIES) {
    const keys = cityKeysForHit(hit);
    if (!keys.includes(cityKey)) continue;
    if (hit.province !== lock.province) return true;
    if (!keys.some((key) => lock.metroKeys.includes(key))) return true;
  }
  for (const hub of CITY_HUB_DEFS) {
    if (!cityHubPlaceKeys(hub).includes(cityKey)) continue;
    if (hub.province !== lock.province) return true;
    if (!cityHubPlaceKeys(hub).some((key) => lock.metroKeys.includes(key))) return true;
  }
  return false;
}

/** Listing stays only if it belongs to the locked city/metro and province. */
export function listingMatchesLocationLock(
  listing: LocationLockListing,
  lock: LocationLock | null | undefined,
): boolean {
  if (!lock) return true;
  const province = normalizeProvinceCode(listing.province);
  if (province && province !== lock.province) return false;
  if (!lock.city) return !province || province === lock.province;
  const cityKey = normalizeCityKey(listing.city);
  if (!cityKey) return province === lock.province;
  if (lock.metroKeys.includes(cityKey)) return true;
  if (knownCityOutsideLock(cityKey, lock)) return false;
  return province === lock.province;
}

export function filterByLocationLock<T extends LocationLockListing>(
  rows: readonly T[],
  lock: LocationLock | null | undefined,
): T[] {
  if (!lock) return [...rows];
  return rows.filter((row) => listingMatchesLocationLock(row, lock));
}
