import { CITIES, PROVINCES } from "./geo.ts";
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

export type DirectionsPlace = {
  apple?: boolean;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
};

const EMPTY_ADDRESS_RE = /^(?:unknown|n\/a|na|—|-|tbd|none|null)$/i;
const PROVINCE_RE = /^(?:AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT)$/i;
const POSTAL_RE = /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\d[ABCEGHJ-NPRSTV-Z]\d$/i;
const NOT_A_STREET_RE = /\b(?:p\.?\s*o\.?\s*box|bo[iî]te\s+postale|general\s+delivery|poste\s+restante)\b/i;
const UNIT_ONLY_RE = /^(?:suite|unit|apt|apartment|bureau|local|#)\s*#?\s*\d+[a-z]?$/i;
/** "Room 104" is a room label. "Room 7-312 Sandy Street" still has a civic street. */
const ROOM_ONLY_RE =
  /^(?:rooms?|rm|classrooms?|salles?|pi[eè]ces?)\.?\s*(?:no\.?|num(?:ber|éro)?|#)?\s*[a-z]?\d{1,5}[a-z]?$/i;
/**
 * Stand-in postal on some Manitoba `mx-` rows. Not a delivery address.
 * Canadian format can still match, so it is listed here on purpose.
 */
const PLACEHOLDER_POSTALS = new Set(["R3K0Z8"]);
/** City-list coordinates are a catalogue default, not a centre door. */
const CITY_CENTROID_EPS = 1e-4;

function clean(value?: string | null) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsToken(haystack: string, token: string) {
  const needle = clean(token);
  if (!needle) return false;
  return new RegExp(`(?:^|[^A-Za-z0-9])${escapeRegExp(needle)}(?:$|[^A-Za-z0-9])`, "i").test(haystack);
}

function containsPostal(haystack: string, postal: string) {
  const compact = postal.replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (compact.length < 6) return false;
  return haystack.replace(/[^a-z0-9]/gi, "").toLowerCase().includes(compact);
}

function isProvincePostal(part: string) {
  const bits = part.split(/\s+/);
  if (!PROVINCE_RE.test(bits[0] || "")) return false;
  const rest = bits.slice(1).join("").toUpperCase();
  return POSTAL_RE.test(rest);
}

/**
 * A civic street line already stored on the listing.
 * City, province, postal, PO box, general delivery, or a room label is not a street.
 */
export function usableStreetAddress(address?: string | null, city?: string | null) {
  const raw = clean(address);
  if (!raw || EMPTY_ADDRESS_RE.test(raw)) return "";
  const cityName = clean(city).toLowerCase();
  const street = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => {
      if (!part) return false;
      const lower = part.toLowerCase();
      if (cityName && lower === cityName) return false;
      if (PROVINCE_RE.test(part)) return false;
      if (POSTAL_RE.test(part.replace(/\s+/g, "").toUpperCase())) return false;
      if (isProvincePostal(part)) return false;
      if (NOT_A_STREET_RE.test(part)) return false;
      return true;
    })
    .join(", ")
    .trim();
  if (!street || UNIT_ONLY_RE.test(street) || ROOM_ONLY_RE.test(street)) return "";
  if (!/\d/.test(street) || !/[A-Za-zÀ-ÿ]/.test(street)) return "";
  return street;
}

function provinceCode(value?: string | null) {
  const raw = clean(value);
  if (!raw) return "";
  if (PROVINCE_RE.test(raw)) return raw.toUpperCase();
  const folded = raw.toLowerCase();
  const hit = PROVINCES.find(
    (p) => p.name.toLowerCase() === folded || p.nameFr.toLowerCase() === folded,
  );
  return hit?.code ?? "";
}

function usablePostal(value?: string | null) {
  const compact = clean(value).replace(/[^a-z0-9]/gi, "").toUpperCase();
  if (!POSTAL_RE.test(compact) || PLACEHOLDER_POSTALS.has(compact)) return "";
  return `${compact.slice(0, 3)} ${compact.slice(3)}`;
}

function nearPoint(lat: number, lng: number, point: { lat: number; lng: number }) {
  return (
    Math.abs(point.lat - lat) <= CITY_CENTROID_EPS && Math.abs(point.lng - lng) <= CITY_CENTROID_EPS
  );
}

function isCityCentroidDefault(lat: number, lng: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return (
    CITIES.some((point) => nearPoint(lat, lng, point)) ||
    PROVINCES.some((point) => nearPoint(lat, lng, point))
  );
}

function regionTail(province: string, postal: string, blob: string) {
  const region: string[] = [];
  if (province && !containsToken(blob, province)) region.push(province);
  if (postal && !containsPostal(blob, postal)) region.push(postal);
  return region.join(" ");
}

function directionsDestination(lat: number, lng: number, name?: string, place?: DirectionsPlace) {
  const city = clean(place?.city);
  const province = provinceCode(place?.province);
  const postal = usablePostal(place?.postalCode);
  const street = usableStreetAddress(place?.address, place?.city);
  if (street) {
    const parts = [street];
    const segments = street.split(",").map((part) => part.trim().toLowerCase());
    if (city && !segments.some((part) => part === city.toLowerCase() || part.startsWith(`${city.toLowerCase()} `))) {
      parts.push(city);
    }
    const blob = parts.join(", ");
    const region = regionTail(province, postal, blob);
    if (region) parts.push(region);
    return parts.join(", ");
  }
  const region = [province, postal].filter(Boolean).join(" ");
  const query = [clean(name), city, region].filter(Boolean).join(", ");
  if (query && (city || province || postal)) return query;
  if (Number.isFinite(lat) && Number.isFinite(lng) && !isCityCentroidDefault(lat, lng)) {
    return `${lat},${lng}`;
  }
  return query;
}

/**
 * Directions to a centre. A stored civic street (with city, province code,
 * and postal when we have them) is the destination. A blank street, a room
 * label, or a known placeholder postal is not an address. Those listings use
 * the centre name, city, province code, and postal we actually have. Raw
 * coordinates are the last resort, and a city-centroid default is never the
 * destination. Nothing here invents a street.
 */
export function directionsUrl(lat: number, lng: number, name?: string, opts?: DirectionsPlace) {
  const dest = directionsDestination(lat, lng, name, opts);
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

export async function openDirections(lat: number, lng: number, name?: string, place?: DirectionsPlace) {
  const url = directionsUrl(lat, lng, name, place);
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
