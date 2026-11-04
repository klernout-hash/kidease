/**
 * Browser Google Maps key.
 *
 * Public JavaScript receives VITE_GOOGLE_MAPS_API_KEY only when the map
 * provider is google (the default). VITE_MAP_PROVIDER=openfreemap, or the
 * NEXT_PUBLIC_MAP_PROVIDER alias, keeps the key out of the client bundle.
 * The value is never logged.
 */

const OPENFREE_MAP = new Set(["openfreemap", "osm", "maplibre", "openstreetmap"]);

export function mapProviderFromEnv(env = {}) {
  const raw = String(env.VITE_MAP_PROVIDER ?? env.NEXT_PUBLIC_MAP_PROVIDER ?? "")
    .trim()
    .toLowerCase();
  if (OPENFREE_MAP.has(raw)) return "openfreemap";
  return "google";
}

export function googleMapsBrowserEnabled(env = {}) {
  return mapProviderFromEnv(env) === "google";
}

/** Empty string when this build is on OpenFreeMap. Never logs the key. */
export function googleMapsBrowserKey(env = {}) {
  if (!googleMapsBrowserEnabled(env)) return "";
  return String(env.VITE_GOOGLE_MAPS_API_KEY || env.GOOGLE_MAPS_API_KEY || "").trim();
}
