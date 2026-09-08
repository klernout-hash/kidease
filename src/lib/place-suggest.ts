/** Local + browser place fallbacks. Relative imports so Node tests can load this. */
import { CITIES, geocode } from "./geo.ts";

export type PlaceSuggestion = { placeId: string; label: string; secondary: string };
export type ResolvedPlace = { lat: number; lng: number; label: string };

export function localPlaceId(label: string) {
  return `local:${label}`;
}

export function isLocalPlaceId(placeId: string) {
  return placeId.startsWith("local:");
}

/** City / neighbourhood matches when Places autocomplete is empty or denied. */
export function suggestLocalPlaces(query: string, limit = 6): PlaceSuggestion[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const out: PlaceSuggestion[] = [];
  const seen = new Set<string>();
  for (const city of CITIES) {
    const label = city.label;
    const hay = `${label} ${city.aliases.join(" ")}`.toLowerCase();
    const aliasHit = city.aliases.some((alias) => alias.length >= 3 && (alias === q || alias.startsWith(q) || q.startsWith(alias)));
    if (!hay.includes(q) && !aliasHit) continue;
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({
      placeId: localPlaceId(label),
      label,
      secondary: city.province,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function resolveLocalPlace(placeId: string): ResolvedPlace | null {
  if (!isLocalPlaceId(placeId)) return null;
  const label = placeId.slice("local:".length);
  return geocode(label);
}

type MapsPlaces = {
  importLibrary?: (name: string) => Promise<{ AutocompleteService?: new () => AutocompleteService }>;
  places?: { AutocompleteService?: new () => AutocompleteService };
  Geocoder?: new () => {
    geocode: (
      req: { address?: string; placeId?: string; componentRestrictions?: { country: string } },
      cb: (results: Array<{ formatted_address?: string; geometry?: { location?: { lat: () => number; lng: () => number } } }> | null) => void,
    ) => void;
  };
  LatLng?: new (lat: number, lng: number) => unknown;
};

type AutocompleteService = {
  getPlacePredictions: (
    req: {
      input: string;
      componentRestrictions?: { country: string };
      location?: unknown;
      radius?: number;
    },
    cb: (
      preds: Array<{
        place_id?: string;
        structured_formatting?: { main_text?: string; secondary_text?: string };
        description?: string;
      }> | null,
    ) => void,
  ) => void;
};

async function mapsApi(): Promise<MapsPlaces | null> {
  if (typeof window === "undefined") return null;
  try {
    const { loadGoogleMaps } = await import("./google-maps.ts");
    return (await loadGoogleMaps()) as MapsPlaces;
  } catch {
    return null;
  }
}

export async function suggestPlacesBrowser(
  query: string,
  origin?: { lat: number; lng: number },
): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const maps = await mapsApi();
  if (!maps) return [];
  try {
    const lib = maps.importLibrary ? await maps.importLibrary("places") : maps.places;
    const Service = lib?.AutocompleteService || maps.places?.AutocompleteService;
    if (!Service) return [];
    const svc = new Service();
    const location = origin && maps.LatLng ? new maps.LatLng(origin.lat, origin.lng) : undefined;
    return await new Promise((resolve) => {
      svc.getPlacePredictions(
        {
          input: q,
          componentRestrictions: { country: "ca" },
          location,
          radius: origin ? 50_000 : undefined,
        },
        (preds) => {
          resolve(
            (preds ?? [])
              .filter((p) => p.place_id)
              .slice(0, 6)
              .map((p) => ({
                placeId: p.place_id!,
                label: p.structured_formatting?.main_text || p.description || q,
                secondary: p.structured_formatting?.secondary_text || p.description || "",
              })),
          );
        },
      );
    });
  } catch {
    return [];
  }
}

export async function geocodeWithBrowser(query: string): Promise<ResolvedPlace | null> {
  const q = query.trim();
  if (!q) return null;
  const maps = await mapsApi();
  if (!maps?.Geocoder) return null;
  try {
    const geocoder = new maps.Geocoder();
    return await new Promise((resolve) => {
      geocoder.geocode({ address: q, componentRestrictions: { country: "CA" } }, (results) => {
        const loc = results?.[0]?.geometry?.location;
        if (!loc) {
          resolve(null);
          return;
        }
        resolve({
          lat: loc.lat(),
          lng: loc.lng(),
          label: results?.[0]?.formatted_address || q,
        });
      });
    });
  } catch {
    return null;
  }
}

export async function resolvePlaceIdBrowser(placeId: string): Promise<ResolvedPlace | null> {
  if (!placeId || isLocalPlaceId(placeId)) return resolveLocalPlace(placeId);
  const maps = await mapsApi();
  if (!maps?.Geocoder) return null;
  try {
    const geocoder = new maps.Geocoder();
    return await new Promise((resolve) => {
      geocoder.geocode({ placeId }, (results) => {
        const loc = results?.[0]?.geometry?.location;
        if (!loc) {
          resolve(null);
          return;
        }
        resolve({
          lat: loc.lat(),
          lng: loc.lng(),
          label: results?.[0]?.formatted_address || placeId,
        });
      });
    });
  } catch {
    return null;
  }
}
