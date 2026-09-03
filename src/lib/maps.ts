import { isNative } from "./native";

export type MapBase = "roadmap" | "satellite";

const MAP_TYPE_KEY = "kidease-map-type";

export function readMapBase(): MapBase {
  if (typeof window === "undefined") return "roadmap";
  try {
    const v = window.localStorage.getItem(MAP_TYPE_KEY);
    return v === "satellite" ? "satellite" : "roadmap";
  } catch {
    return "roadmap";
  }
}

export function writeMapBase(base: MapBase) {
  try {
    window.localStorage.setItem(MAP_TYPE_KEY, base);
  } catch {
    /* ignore */
  }
}

export function directionsUrl(lat: number, lng: number, name?: string) {
  const dest = `${lat},${lng}`;
  const q = new URLSearchParams({
    api: "1",
    destination: dest,
    travelmode: "driving",
  });
  if (name) q.set("destination_place_id", "");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`;
}

export async function openDirections(lat: number, lng: number, name?: string) {
  const url = directionsUrl(lat, lng, name);
  if (isNative()) {
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url });
      return;
    } catch {
      /* fall through */
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export function mapZoomForRadius(radiusKm: number) {
  if (radiusKm <= 2) return 14;
  if (radiusKm <= 5) return 13;
  if (radiusKm <= 10) return 12;
  if (radiusKm <= 20) return 11;
  if (radiusKm <= 35) return 10;
  return 9;
}
