import { createServerFn } from "@tanstack/react-start";
import { catalogByIdGet } from "@/lib/catalog";
import { placesBiasOrigin } from "@/lib/default-origin";
import {
  PHOTON_MAX_WAIT_MS,
  PHOTON_MIN_INTERVAL_MS,
  PHOTON_USER_AGENT,
  decodePhotonPlaceId,
  photonSearchUrl,
  photonSuggestions,
  photonToPlace,
  type PhotonFeature,
  type PhotonPlace,
} from "@/lib/photon";

export type PlaceSuggestion = { placeId: string; label: string; secondary: string };
export type ResolvedPlace = { lat: number; lng: number; label: string };

const GEO_TTL_MS = 24 * 60 * 60 * 1000;
const GEO_MISS_TTL_MS = 10 * 60 * 1000;
const GEO_MAX = 200;

const geoCache = new Map<string, { at: number; value: ResolvedPlace | null }>();
const suggestCache = new Map<string, { at: number; value: PlaceSuggestion[] }>();
let photonReadyAt = 0;

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function trimCache(map: Map<string, unknown>) {
  if (map.size <= GEO_MAX) return;
  const oldest = map.keys().next().value;
  if (typeof oldest === "string") map.delete(oldest);
}

function readGeo(key: string): ResolvedPlace | null | undefined {
  const hit = geoCache.get(key);
  if (!hit) return undefined;
  const ttl = hit.value ? GEO_TTL_MS : GEO_MISS_TTL_MS;
  if (Date.now() - hit.at > ttl) {
    geoCache.delete(key);
    return undefined;
  }
  return hit.value;
}

function storeGeo(key: string, value: ResolvedPlace | null) {
  geoCache.set(key, { at: Date.now(), value });
  trimCache(geoCache);
}

/**
 * One in-flight Photon call per server process.
 * A long queue returns nothing so the city list can answer instead.
 */
async function photonFetch(url: string): Promise<PhotonFeature[] | "busy"> {
  const now = Date.now();
  const wait = Math.max(0, photonReadyAt - now);
  if (wait > PHOTON_MAX_WAIT_MS) return "busy";
  photonReadyAt = now + wait + PHOTON_MIN_INTERVAL_MS;
  if (wait > 0) await delay(wait);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": PHOTON_USER_AGENT },
      signal: ctrl.signal,
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { features?: PhotonFeature[] };
    return Array.isArray(json.features) ? json.features : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export const suggestPlaces = createServerFn({ method: "POST" })
  .validator((input: { q: string; session?: string; lat?: number; lng?: number }) => ({
    q: String(input?.q ?? "").trim().slice(0, 120),
    session: String(input?.session ?? "").slice(0, 64),
    lat: typeof input?.lat === "number" && Number.isFinite(input.lat) ? input.lat : undefined,
    lng: typeof input?.lng === "number" && Number.isFinite(input.lng) ? input.lng : undefined,
  }))
  .handler(async ({ data }): Promise<PlaceSuggestion[]> => {
    if (data.q.length < 2) return [];
    const bias = placesBiasOrigin({ lat: data.lat, lng: data.lng });
    const cacheKey = `${data.q.toLowerCase()}|${bias.lat.toFixed(2)},${bias.lng.toFixed(2)}`;
    const saved = suggestCache.get(cacheKey);
    if (saved && Date.now() - saved.at < GEO_TTL_MS) return saved.value;
    const features = await photonFetch(photonSearchUrl(data.q, bias, 8));
    if (features === "busy") return [];
    const rows = photonSuggestions(features, 6);
    if (rows.length) {
      suggestCache.set(cacheKey, { at: Date.now(), value: rows });
      trimCache(suggestCache);
    }
    return rows;
  });

export const resolvePlaceId = createServerFn({ method: "POST" })
  .validator((input: { placeId: string; session?: string }) => ({
    placeId: String(input?.placeId ?? "").slice(0, 512),
    session: String(input?.session ?? "").slice(0, 64),
  }))
  .handler(async ({ data }): Promise<ResolvedPlace | null> => {
    return decodePhotonPlaceId(data.placeId);
  });

export const geocodePlace = createServerFn({ method: "POST" })
  .validator((q: string) => String(q ?? "").trim().slice(0, 160))
  .handler(async ({ data }): Promise<ResolvedPlace | null> => {
    if (!data) return null;
    const cacheKey = data.toLowerCase();
    const cached = readGeo(cacheKey);
    if (cached !== undefined) return cached;
    const bias = placesBiasOrigin();
    const features = await photonFetch(photonSearchUrl(data, bias, 5));
    if (features === "busy") return null;
    let place: PhotonPlace | null = null;
    for (const feature of features) {
      place = photonToPlace(feature, data);
      if (place) break;
    }
    storeGeo(cacheKey, place);
    return place;
  });

/**
 * Stored ratings only. The Google Places refresh is off while that account
 * is not in use. Nothing here invents a score.
 */
export const refreshGoogleRating = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const listed = await catalogByIdGet(id);
    if (!listed) return null;
    return {
      ratingX10: listed.ratingX10,
      reviewCount: listed.reviewCount,
      googlePlaceId: listed.googlePlaceId,
    };
  });
