/**
 * Which basemap the website and the native WebViews use.
 *
 * `VITE_MAP_PROVIDER=google|openfreemap` (default google).
 * `NEXT_PUBLIC_MAP_PROVIDER` is the same switch for hosts that use that name.
 * OpenFreeMap stays in the bundle. Set the switch to `openfreemap` and rebuild
 * to stop shipping the Google browser key. A failed Google script or
 * `gm_authFailure` forces OpenFreeMap for the rest of the page session.
 */

export type MapProviderName = "google" | "openfreemap";

const OPENFREE_MAP = new Set(["openfreemap", "osm", "maplibre", "openstreetmap"]);

type ProviderEnv = {
  VITE_MAP_PROVIDER?: string | null;
  NEXT_PUBLIC_MAP_PROVIDER?: string | null;
};

export function mapProviderFromEnv(env: ProviderEnv = {}): MapProviderName {
  const raw = String(env.VITE_MAP_PROVIDER ?? env.NEXT_PUBLIC_MAP_PROVIDER ?? "")
    .trim()
    .toLowerCase();
  if (OPENFREE_MAP.has(raw)) return "openfreemap";
  return "google";
}

let forced: MapProviderName | null = null;

/** Session fallback after the Google script or key fails. Not a second build. */
export function forceMapProvider(provider: MapProviderName) {
  forced = provider;
}

export function resetMapProviderForTests() {
  forced = null;
}

function clientEnv(): ProviderEnv & { VITE_GOOGLE_MAPS_API_KEY?: string } {
  const env = (import.meta as { env?: ProviderEnv & { VITE_GOOGLE_MAPS_API_KEY?: string } }).env;
  return env ?? {};
}

export function preferredMapProvider(): MapProviderName {
  if (forced) return forced;
  const env = clientEnv();
  return mapProviderFromEnv(env);
}

/**
 * Browser key inlined by Vite. Empty when the provider is OpenFreeMap,
 * or when the host did not set one. Never reads a server-only key name.
 */
export function browserGoogleMapsKey(): string {
  if (preferredMapProvider() !== "google") return "";
  const key = clientEnv().VITE_GOOGLE_MAPS_API_KEY;
  return typeof key === "string" ? key.trim() : "";
}
