/**
 * Short popular-city list for the guest home hero.
 * Home is not a national button directory — autocomplete and Explore cover the rest.
 *
 * Order:
 *  1. Trusted nearby hub (explicit Toronto is allowed; inferred Toronto is not)
 *  2. Winnipeg when locale/geo suggests MB, origin is missing, or Toronto is untrusted
 *  3. Default Winnipeg-first set — never Toronto-first as the implied home city
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
import {
  isTorontoLikeOrigin,
  isUntrustedTorontoOrigin,
  localeSuggestsManitoba,
  type OriginResolveSource,
} from "./default-origin.ts";
import { CITIES, haversineKm, type LatLng } from "./geo.ts";

export const POPULAR_HOME_CITY_SLUGS = [
  "winnipeg",
  "toronto",
  "vancouver",
  "calgary",
  "montreal",
  "edmonton",
] as const;

export const POPULAR_HOME_CITY_LIMIT = 6;
export const POPULAR_HOME_NEAR_KM = 75;

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

const TRUSTED_NEARBY_SOURCES = new Set(["manual", "gps", "saved"]);

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

function isChosenOrigin(origin: PopularHomeOrigin | null | undefined) {
  if (!origin) return false;
  if (origin.explicit === true) return true;
  return TRUSTED_NEARBY_SOURCES.has(String(origin.source || ""));
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
  const winnipeg = cityHubDefBySlug("winnipeg")!;
  const here = originPoint(origin);
  const mbFirst = localeSuggestsManitoba({ timeZone: origin?.timeZone });

  if (here && isChosenOrigin(origin)) {
    const nearby = nearestHub(here, CITY_HUB_DEFS);
    if (nearby) return nearby;
  }

  if (here && !isUntrustedTorontoOrigin(here) && !isTorontoLikeOrigin(here)) {
    const nearby = nearestHub(here, CITY_HUB_DEFS);
    if (nearby && nearby.slug !== "toronto") return nearby;
  }

  if (mbFirst) return winnipeg;
  return winnipeg;
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
