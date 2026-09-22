import { geocode, haversineKm } from "./geo.ts";

/** Parse `q` from TanStack `location.search` (object or query string). */
export function searchQueryFromUnknown(search: unknown): string {
  if (typeof search === "string") {
    const raw = search.startsWith("?") ? search.slice(1) : search;
    return new URLSearchParams(raw).get("q")?.trim() || "";
  }
  if (search && typeof search === "object" && "q" in search) {
    const q = (search as { q?: unknown }).q;
    return typeof q === "string" ? q.trim() : "";
  }
  return "";
}

/** Local city / FSA / postal geocode for an explicit search query. */
export function originFromSearchQuery(q?: string | null) {
  const raw = typeof q === "string" ? q.trim() : "";
  if (!raw) return null;
  return geocode(raw);
}

export function originsMatchSearchQuery(
  origin: { lat: number; lng: number } | null | undefined,
  q?: string | null,
  epsilon = 0.05,
) {
  const wanted = originFromSearchQuery(q);
  if (!wanted) return true;
  if (!origin) return false;
  return Math.abs(origin.lat - wanted.lat) < epsilon && Math.abs(origin.lng - wanted.lng) < epsilon;
}

/**
 * A named city owns the search when the stored pin is outside that city's
 * radius. Edmonton in the query must not keep a Winnipeg pin and return 0.
 * A pin already inside the radius stays, so a street search is unchanged.
 */
export function alignSearchOrigin(input: {
  lat: number;
  lng: number;
  radiusKm: number;
  q?: string | null;
  label?: string | null;
}): { lat: number; lng: number; label: string } {
  const pin = { lat: Number(input.lat), lng: Number(input.lng) };
  const named = originFromSearchQuery(input.q) || originFromSearchQuery(input.label);
  const label = named?.label || (input.label || "").trim();
  if (!named) return { lat: pin.lat, lng: pin.lng, label };
  const pinOk = Number.isFinite(pin.lat) && Number.isFinite(pin.lng) && !(pin.lat === 0 && pin.lng === 0);
  if (!pinOk || haversineKm(pin, named) > Math.max(1, input.radiusKm)) {
    return { lat: named.lat, lng: named.lng, label: named.label };
  }
  return { lat: pin.lat, lng: pin.lng, label: label || named.label };
}

/**
 * A city the parent typed (`Edmonton`, `Edmonton, AB`, a postal code).
 * Device labels such as "Near Selkirk, MB" contain a city alias but are not a search.
 */
export function explicitCityQuery(q?: string | null) {
  const raw = typeof q === "string" ? q.trim() : "";
  if (!raw) return null;
  const hit = geocode(raw);
  if (!hit) return null;
  const query = raw.toLowerCase();
  const label = hit.label.toLowerCase();
  const city = label.split(",")[0]?.trim() || "";
  if (query === label || query === city || query.startsWith(`${city},`) || query.startsWith(`${city} `)) {
    return hit;
  }
  const compact = query.replace(/[^a-z0-9]/g, "");
  if (/^[a-z]\d[a-z](?:\d[a-z]\d)?$/.test(compact)) return hit;
  return null;
}

/**
 * Map circle for Explore. A searched city owns the camera when the stored pin
 * (device GPS, IP, or a previous city) sits outside that city's radius.
 * A loose device label does not pull the camera off the fix.
 */
export function searchMapOrigin(input: {
  lat: number;
  lng: number;
  radiusKm: number;
  q?: string | null;
  label?: string | null;
}): { lat: number; lng: number; label: string } {
  const named = explicitCityQuery(input.q);
  if (!named) {
    return {
      lat: Number(input.lat),
      lng: Number(input.lng),
      label: (input.label || "").trim(),
    };
  }
  return alignSearchOrigin({
    lat: input.lat,
    lng: input.lng,
    radiusKm: input.radiusKm,
    q: named.label,
    label: named.label,
  });
}

/**
 * Live GPS must not replace a city search. A manual pick or `?q=Edmonton`
 * keeps the camera until the parent locates again and the query changes.
 */
export function gpsMayMoveSearchOrigin(input: {
  originSource?: string | null;
  q?: string | null;
}) {
  if (input.originSource === "manual") return false;
  if (explicitCityQuery(input.q)) return false;
  return true;
}

/** Typed `?q=Winnipeg` (etc.) owns origin — do not let saved GPS overwrite it. */
export function urlHasGeocodableSearchQuery(
  search = typeof window === "undefined" ? "" : window.location.search,
) {
  return Boolean(originFromSearchQuery(searchQueryFromUnknown(search)));
}
