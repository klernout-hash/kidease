import { isNative, nativePlatform } from "./native.ts";

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

/** iOS, iPadOS, and macOS open Apple Maps. Android and other browsers open Google Maps. */
export function preferAppleMaps() {
  if (typeof window === "undefined") return false;
  if (nativePlatform() === "ios") return true;
  if (nativePlatform() === "android") return false;
  const ua = window.navigator?.userAgent || "";
  if (/Android/i.test(ua)) return false;
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  return /Macintosh|Mac OS X/i.test(ua);
}

/**
 * Directions to a centre. Coordinates win when they exist; otherwise the name
 * or address string already on the listing is the destination.
 */
export function directionsUrl(lat: number, lng: number, name?: string, opts?: { apple?: boolean }) {
  const point = Number.isFinite(lat) && Number.isFinite(lng) ? `${lat},${lng}` : "";
  const label = (name || "").trim();
  const dest = point || label;
  if (!dest) return "https://www.google.com/maps";
  const apple = opts?.apple ?? preferAppleMaps();
  if (apple) {
    const q = new URLSearchParams({ daddr: dest, dirflg: "d" });
    return `https://maps.apple.com/?${q.toString()}`;
  }
  const q = new URLSearchParams({
    api: "1",
    destination: dest,
    travelmode: "driving",
  });
  return `https://www.google.com/maps/dir/?${q.toString()}`;
}

export type PinPopupPlacement = "above" | "below";

export type PinPopupBox = {
  left: number;
  top: number;
  caretX: number;
  placement: PinPopupPlacement;
};

/** Sit a listing popup on the logo pin and keep it inside the map. */
export function placePinPopup(opts: {
  pointX: number;
  pointY: number;
  width: number;
  height: number;
  mapWidth: number;
  mapHeight: number;
  pinHeight?: number;
  pad?: number;
  padTop?: number;
  padRight?: number;
  padBottom?: number;
  padLeft?: number;
  gap?: number;
}): PinPopupBox {
  const pinHeight = opts.pinHeight ?? 44;
  const pad = opts.pad ?? 8;
  const padTop = opts.padTop ?? pad;
  const padRight = opts.padRight ?? pad;
  const padBottom = opts.padBottom ?? pad;
  const padLeft = opts.padLeft ?? pad;
  const gap = opts.gap ?? 8;
  const width = Math.max(0, opts.width);
  const height = Math.max(0, opts.height);
  const mapWidth = Math.max(0, opts.mapWidth);
  const mapHeight = Math.max(0, opts.mapHeight);
  let placement: PinPopupPlacement = "above";
  let top = opts.pointY - pinHeight - gap - height;
  if (top < padTop) {
    placement = "below";
    top = opts.pointY + gap;
  }
  const maxLeft = Math.max(padLeft, mapWidth - width - padRight);
  const left = clamp(opts.pointX - width / 2, padLeft, maxLeft);
  const maxTop = Math.max(padTop, mapHeight - height - padBottom);
  top = clamp(top, padTop, maxTop);
  const caretX = clamp(opts.pointX - left, 16, Math.max(16, width - 16));
  return { left, top, caretX, placement };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
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

/**
 * Fallback zoom when circle bounds are not ready.
 * Tuned so a 16 mi / 25 km search fills the map instead of a city-wide view.
 */
export function mapZoomForRadius(radiusKm: number) {
  if (radiusKm <= 2) return 14;
  if (radiusKm <= 5) return 13;
  if (radiusKm <= 10) return 12;
  if (radiusKm <= 18) return 11;
  if (radiusKm <= 32) return 10;
  if (radiusKm <= 45) return 9;
  return 8;
}

/** Tight inset so fitBounds frames the search circle, not the listing card chrome. */
export const MAP_RADIUS_FIT_PAD = { top: 72, right: 64, bottom: 28, left: 16 };
