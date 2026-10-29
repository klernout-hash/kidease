/**
 * Photon (OpenStreetMap) lookup helpers.
 * The public server is free and has no key. Callers must cache and wait
 * between requests. https://github.com/komoot/photon
 */

export const PHOTON_ENDPOINT = "https://photon.komoot.io/api/";
export const PHOTON_USER_AGENT = "KidEase/1.0 (+https://kidease.ca)";
/** One request at a time. The public Photon server asks for fair use. */
export const PHOTON_MIN_INTERVAL_MS = 1100;
/** Skip the network when the queue is already this far behind. Local cities still work. */
export const PHOTON_MAX_WAIT_MS = 1200;
/** Canada only. West, south, east, north. */
export const CANADA_BBOX = "-141.0,41.6,-52.6,83.2";

const PLACE_ID_PREFIX = "photon:";

const SUGGEST_TYPES = new Set([
  "city",
  "town",
  "village",
  "hamlet",
  "locality",
  "suburb",
  "neighbourhood",
  "district",
  "county",
  "state",
  "postcode",
  "municipality",
]);

export type PhotonProperties = {
  osm_id?: number;
  osm_type?: string;
  name?: string;
  street?: string;
  housenumber?: string;
  city?: string;
  locality?: string;
  district?: string;
  state?: string;
  country?: string;
  countrycode?: string;
  type?: string;
};

export type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: PhotonProperties;
};

export type PhotonPlace = { lat: number; lng: number; label: string };

export type PhotonSuggestion = { placeId: string; label: string; secondary: string };

export function photonSearchUrl(
  query: string,
  bias?: { lat?: number; lng?: number },
  limit = 6,
): string {
  const params = new URLSearchParams({
    q: query.trim(),
    limit: String(limit),
    lang: "en",
    bbox: CANADA_BBOX,
  });
  if (bias && Number.isFinite(bias.lat) && Number.isFinite(bias.lng)) {
    params.set("lat", String(bias.lat));
    params.set("lon", String(bias.lng));
  }
  return `${PHOTON_ENDPOINT}?${params.toString()}`;
}

export function photonWaitMs(lastReadyAt: number, now: number, minInterval = PHOTON_MIN_INTERVAL_MS): number {
  if (!lastReadyAt) return 0;
  return Math.max(0, minInterval - (now - lastReadyAt));
}

function clean(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function photonLabel(props: PhotonProperties | undefined, fallback: string): string {
  const name = clean(props?.name);
  const streetLine = [clean(props?.housenumber), clean(props?.street)].filter(Boolean).join(" ");
  const place = clean(props?.city) || clean(props?.locality) || clean(props?.district);
  const state = clean(props?.state);
  const head = name && name.toLowerCase() !== streetLine.toLowerCase() ? name : streetLine;
  const parts = [head || streetLine, place, state].filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }
  return out.join(", ") || fallback;
}

function inCanada(props: PhotonProperties | undefined): boolean {
  const code = clean(props?.countrycode).toUpperCase();
  if (code) return code === "CA";
  return clean(props?.country).toLowerCase() === "canada";
}

export function photonToPlace(feature: PhotonFeature, fallback: string): PhotonPlace | null {
  if (!inCanada(feature.properties)) return null;
  const pair = feature.geometry?.coordinates;
  const lng = pair?.[0];
  const lat = pair?.[1];
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return { lat, lng, label: photonLabel(feature.properties, fallback) };
}

export function encodePhotonPlaceId(place: PhotonPlace): string {
  return `${PLACE_ID_PREFIX}${place.lat.toFixed(5)},${place.lng.toFixed(5)},${encodeURIComponent(place.label)}`;
}

export function decodePhotonPlaceId(id: string): PhotonPlace | null {
  if (!id.startsWith(PLACE_ID_PREFIX)) return null;
  const body = id.slice(PLACE_ID_PREFIX.length);
  const first = body.indexOf(",");
  const second = body.indexOf(",", first + 1);
  if (first < 0 || second < 0) return null;
  const lat = Number(body.slice(0, first));
  const lng = Number(body.slice(first + 1, second));
  let label = "";
  try {
    label = decodeURIComponent(body.slice(second + 1));
  } catch {
    return null;
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !label.trim()) return null;
  return { lat, lng, label };
}

export function photonSuggestions(features: readonly PhotonFeature[], limit = 6): PhotonSuggestion[] {
  const canadian = features
    .map((feature) => ({ feature, place: photonToPlace(feature, "") }))
    .filter((row): row is { feature: PhotonFeature; place: PhotonPlace } => Boolean(row.place?.label));
  const preferred = canadian.filter((row) => SUGGEST_TYPES.has(clean(row.feature.properties?.type).toLowerCase()));
  const rows = (preferred.length ? preferred : canadian).slice(0, limit);
  return rows.map((row) => {
    const secondary = [clean(row.feature.properties?.state), "Canada"].filter(Boolean).join(", ");
    return {
      placeId: encodePhotonPlaceId(row.place),
      label: row.place.label,
      secondary,
    };
  });
}
