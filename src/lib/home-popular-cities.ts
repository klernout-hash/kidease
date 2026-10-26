/**
 * Short popular-city list for the guest home hero.
 * Home is not a national button directory — autocomplete and Explore cover the rest.
 *
 * Order:
 *  1. The nearest city hub when the visitor's place is already known, including Toronto
 *  2. A national list when location is unknown. Winnipeg is one city on that list, not the lead.
 */

import {
  CITY_HUB_DEFS,
  cityHubCityName,
  cityHubDefBySlug,
  cityHubPlaceKeys,
  cityHubSearchQuery,
  normalizeCityKey,
  type CityHubDef,
} from "./city-hubs.ts";
import { type OriginResolveSource } from "./default-origin.ts";
import { CITIES, haversineKm, type LatLng } from "./geo.ts";

export const POPULAR_HOME_CITY_SLUGS = [
  "toronto",
  "montreal",
  "vancouver",
  "calgary",
  "edmonton",
  "winnipeg",
] as const;

export const POPULAR_HOME_CITY_LIMIT = 6;
export const POPULAR_HOME_NEAR_KM = 75;
/** Closest hubs under the home search when location is already known. */
export const NEARBY_HOME_CITY_LIMIT = 4;
export const NEARBY_HOME_MAX_KM = 550;

const KNOWN_LOCATION_SOURCES = new Set(["manual", "gps", "saved", "ip"]);

export type PopularHomeCity = {
  slug: string;
  q: string;
  label: string;
};

export type PopularHomeOrigin = Partial<LatLng> & {
  label?: string;
  explicit?: boolean;
  source?: OriginResolveSource | string | null;
  timeZone?: string | null;
};

export function hubLatLng(hub: CityHubDef): LatLng | null {
  const keys = new Set(cityHubPlaceKeys(hub));
  for (const city of CITIES) {
    const labelCity = normalizeCityKey(city.label.split(",")[0]);
    if (keys.has(labelCity)) return { lat: city.lat, lng: city.lng };
    if (city.aliases.some((alias) => keys.has(normalizeCityKey(alias)))) {
      return { lat: city.lat, lng: city.lng };
    }
  }
  return null;
}

function originPoint(origin: PopularHomeOrigin | null | undefined): (LatLng & { label: string }) | null {
  if (!origin || typeof origin.lat !== "number" || typeof origin.lng !== "number") return null;
  return { lat: origin.lat, lng: origin.lng, label: origin.label || "" };
}

function nearestHub(here: LatLng, hubs: readonly CityHubDef[]) {
  let best: { hub: CityHubDef; km: number } | null = null;
  for (const hub of hubs) {
    const coords = hubLatLng(hub);
    if (!coords) continue;
    const km = haversineKm(here, coords);
    if (km > POPULAR_HOME_NEAR_KM) continue;
    if (!best || km < best.km) best = { hub, km };
  }
  return best?.hub ?? null;
}

export function pickPopularHomeLead(origin?: PopularHomeOrigin | null): CityHubDef {
  const label = (origin?.label || "").trim();
  if (label) {
    const named = CITY_HUB_DEFS.find((hub) => hubMatchesLabel(hub, label));
    if (named) return named;
  }
  const here = originPoint(origin);
  if (here) {
    const nearby = nearestHub(here, CITY_HUB_DEFS);
    if (nearby) return nearby;
  }
  return cityHubDefBySlug(POPULAR_HOME_CITY_SLUGS[0])!;
}

/** True when a city is already on the search box or from an existing geo header. Never prompts. */
export function locationKnownForNearby(origin?: PopularHomeOrigin | null) {
  if (!origin) return false;
  if (origin.explicit === true) return true;
  return KNOWN_LOCATION_SOURCES.has(String(origin.source || ""));
}

function hubMatchesLabel(hub: CityHubDef, label: string) {
  const keys = new Set(cityHubPlaceKeys(hub));
  const city = normalizeCityKey(label.split(",")[0]);
  const full = normalizeCityKey(label);
  return (city && keys.has(city)) || (full && keys.has(full));
}

/**
 * Three or four nearby city hubs when the visitor's city is already known.
 * An unknown location returns none. The Canada camera is not a city.
 */
export function nearbyHomeCities(
  origin?: PopularHomeOrigin | null,
  locale = "en",
): PopularHomeCity[] {
  if (!locationKnownForNearby(origin)) return [];
  const here = originPoint(origin);
  if (!here) return [];
  const label = origin?.label || "";
  const ranked = CITY_HUB_DEFS.flatMap((hub) => {
    if (hubMatchesLabel(hub, label)) return [];
    const coords = hubLatLng(hub);
    if (!coords) return [];
    const km = haversineKm(here, coords);
    if (km > NEARBY_HOME_MAX_KM) return [];
    return [{ hub, km }];
  }).sort((a, b) => a.km - b.km);
  return ranked.slice(0, NEARBY_HOME_CITY_LIMIT).map(({ hub }) => ({
    slug: hub.slug,
    q: cityHubSearchQuery(hub),
    label: cityHubCityName(hub, locale),
  }));
}

export function popularHomeCities(
  origin?: PopularHomeOrigin | null,
  locale = "en",
): PopularHomeCity[] {
  const base = POPULAR_HOME_CITY_SLUGS.map((slug) => cityHubDefBySlug(slug)).filter(
    (hub): hub is CityHubDef => Boolean(hub),
  );
  const lead = pickPopularHomeLead(origin);
  const rest = base.filter((hub) => hub.slug !== lead.slug);
  return [lead, ...rest].slice(0, POPULAR_HOME_CITY_LIMIT).map((hub) => ({
    slug: hub.slug,
    q: cityHubSearchQuery(hub),
    label: cityHubCityName(hub, locale),
  }));
}
