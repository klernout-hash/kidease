import { CANADA_CAMERA, isInCanada } from "./canada-origin.ts";
import { CITIES, PROVINCES, WINNIPEG, haversineKm, type LatLng } from "./geo.ts";

/**
 * Default Explore / search center.
 *
 * KidEase covers licensed daycares in every province and territory. No city
 * is the product default.
 *
 * Priority (first match wins):
 *  1. Explicit query / city chip / Places pick — caller applies this.
 *  2. Browser geolocation when permission is granted and the fix is in Canada.
 *  3. A saved Canadian origin the parent already chose.
 *  4. IP geolocation when the country is Canada (any province, including Ontario).
 *  5. A neutral Canada-wide view. Empty label. No city query.
 */

export type SearchOrigin = LatLng & { label: string; explicit?: boolean };

export type OriginResolveSource = "gps" | "manual" | "saved" | "ip" | "default";

export type HeaderReader = { get(name: string): string | null };

export type IpGeoHint = {
  lat?: number;
  lng?: number;
  city?: string;
  region?: string;
  country?: string;
  timeZone?: string;
  colo?: string;
};

export type DeviceFix = LatLng & { accuracyM?: number };

export type ResolvedOrigin = SearchOrigin & { source: OriginResolveSource };

export type SavedOriginHint = Partial<LatLng> & {
  label?: string;
  explicit?: boolean;
  source?: OriginResolveSource | string;
};

/** Neutral Canada camera. Empty label so nothing writes ?q= to a city. */
export const PRODUCT_HOME: SearchOrigin = {
  lat: CANADA_CAMERA.lat,
  lng: CANADA_CAMERA.lng,
  label: "",
};

export function isNeutralCanadaOrigin(
  origin: { label?: string | null; source?: string | null } | null | undefined,
) {
  if (!origin) return true;
  if (origin.source === "default") return true;
  return !(origin.label || "").trim() && origin.source !== "gps" && origin.source !== "ip" && origin.source !== "saved" && origin.source !== "manual";
}

/** Cell / IP-class accuracy. Street GPS is typically well under 1 km. */
export const COARSE_ACCURACY_M = 25_000;

/**
 * Real device GPS is usually tens of metres. Browser location that is actually
 * an IP/Wi-Fi guess often claims 500 m–20 km and still pins Toronto.
 */
export const STREET_GPS_ACCURACY_M = 150;

const TORONTO = CITIES.find((c) => c.label === "Toronto, ON")!;

/** Cloudflare / typical GTA edge colos that get mis-read as “the user is in Toronto”. */
const TORONTO_EDGE_COLOS = new Set(["YYZ", "YTZ", "YTO"]);

export function productHomeOrigin(): ResolvedOrigin {
  return { ...PRODUCT_HOME, source: "default" };
}

/**
 * Plain `/search` when GPS, a saved city, and a trusted Canadian IP are all missing.
 * The neutral Canada camera stays for places bias. The directory itself opens on Winnipeg.
 */
export function searchOriginOrWinnipeg(origin: ResolvedOrigin): ResolvedOrigin {
  if (origin.source === "default" || isNeutralCanadaOrigin(origin)) {
    return { lat: WINNIPEG.lat, lng: WINNIPEG.lng, label: WINNIPEG.label, source: "default" };
  }
  return origin;
}

export function isCoarseFix(fix: Pick<DeviceFix, "accuracyM"> | null | undefined) {
  const accuracy = fix?.accuracyM;
  return typeof accuracy === "number" && Number.isFinite(accuracy) && accuracy > COARSE_ACCURACY_M;
}

export function isStreetGpsFix(fix: Pick<DeviceFix, "accuracyM"> | null | undefined) {
  const accuracy = fix?.accuracyM;
  return typeof accuracy === "number" && Number.isFinite(accuracy) && accuracy <= STREET_GPS_ACCURACY_M;
}

export function isPreciseCanadaFix(fix: DeviceFix | null | undefined) {
  if (!fix || !isInCanada(fix.lat, fix.lng)) return false;
  return !isCoarseFix(fix);
}

export function readClientTimeZone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && tz.trim() ? tz.trim() : null;
  } catch {
    return null;
  }
}

export function timezoneLooksLikeManitoba(tz?: string | null) {
  const n = (tz || "").trim();
  return n === "America/Winnipeg" || n === "America/Rainy_River";
}

export function parseCfColo(cfRay?: string | null) {
  const raw = (cfRay || "").trim();
  const m = raw.match(/-([A-Za-z]{3})$/);
  return m?.[1] ? m[1].toUpperCase() : "";
}

export function isTorontoEdgeColo(colo?: string | null) {
  return TORONTO_EDGE_COLOS.has((colo || "").trim().toUpperCase());
}

function normalizeCountry(value?: string | null) {
  const raw = (value || "").trim().toUpperCase();
  if (raw === "CA" || raw === "CAN" || raw === "CANADA") return "CA";
  return raw || "";
}

function normalizeRegion(value?: string | null) {
  const raw = (value || "").trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  const byCode = PROVINCES.find((p) => p.code === upper);
  if (byCode) return byCode.code;
  const lower = raw.toLowerCase();
  const byName = PROVINCES.find(
    (p) => p.name.toLowerCase() === lower || p.nameFr.toLowerCase() === lower,
  );
  return byName?.code ?? "";
}

function namedCity(name: string) {
  return (
    CITIES.find(
      (c) =>
        c.label.toLowerCase() === name ||
        c.label.toLowerCase().startsWith(`${name},`) ||
        c.aliases.some((a) => a === name),
    ) ?? null
  );
}

/**
 * A header city name only wins when it agrees with the coordinates.
 * "Edmonton" plus a Winnipeg pin must not pretend the parent is downtown Edmonton.
 */
function cityFromHint(hint: { city?: string; lat?: number; lng?: number } | null | undefined) {
  const name = (hint?.city || "").trim().toLowerCase();
  const named = name ? namedCity(name) : null;
  const coords =
    typeof hint?.lat === "number" &&
    typeof hint?.lng === "number" &&
    isInCanada(hint.lat, hint.lng)
      ? { lat: hint.lat, lng: hint.lng }
      : null;
  if (named && coords && haversineKm(coords, named) <= 80) return named;
  if (named && !coords) return named;
  if (coords) {
    let best = CITIES[0]!;
    let bestD = Infinity;
    for (const c of CITIES) {
      const d = haversineKm(coords, c);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    if (bestD <= 40) return best;
  }
  return null;
}

/** Rough Manitoba box. Edmonton is west of this, so a bad Alberta pin does not count. */
export function originInManitoba(origin: { lat?: number; lng?: number; label?: string | null } | null | undefined) {
  if (!origin) return false;
  const label = (origin.label || "").trim().toUpperCase();
  if (label.endsWith(", MB") || label === "MANITOBA" || label === "WINNIPEG") return true;
  const lat = Number(origin.lat);
  const lng = Number(origin.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat >= 48.9 && lat <= 60.1 && lng >= -102.1 && lng <= -88.8;
}

/**
 * Directory origin for home and search.
 * No geo, or a Manitoba clock with a pin outside Manitoba, opens on Winnipeg.
 * A GPS fix or a city the parent typed stays put.
 */
export function coerceDirectoryOrigin(
  origin: ResolvedOrigin,
  _timeZone?: string | null,
): ResolvedOrigin {
  // No geo header becomes Winnipeg. A real IP city, GPS fix, or typed place stays.
  return searchOriginOrWinnipeg(origin);
}

function decodeHeader(value: string) {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

function header(headers: HeaderReader | null | undefined, name: string) {
  return decodeHeader((headers?.get(name) || "").trim());
}

function headerNumber(headers: HeaderReader | null | undefined, name: string) {
  const n = Number(header(headers, name));
  return Number.isFinite(n) ? n : undefined;
}

/** Vercel + Cloudflare request geo. Missing headers → null (treat as unknown). */
export function parseIpGeoHeaders(headers: HeaderReader | null | undefined): IpGeoHint | null {
  if (!headers) return null;
  const country = normalizeCountry(
    header(headers, "x-vercel-ip-country") || header(headers, "cf-ipcountry"),
  );
  const region =
    normalizeRegion(header(headers, "x-vercel-ip-country-region")) ||
    normalizeRegion(header(headers, "cf-region-code")) ||
    normalizeRegion(header(headers, "cf-region"));
  const city = header(headers, "x-vercel-ip-city") || header(headers, "cf-ipcity");
  const lat =
    headerNumber(headers, "x-vercel-ip-latitude") ?? headerNumber(headers, "cf-iplatitude");
  const lng =
    headerNumber(headers, "x-vercel-ip-longitude") ?? headerNumber(headers, "cf-iplongitude");
  const timeZone = header(headers, "x-vercel-ip-timezone") || header(headers, "cf-timezone");
  const colo = parseCfColo(header(headers, "cf-ray"));
  if (!country && !region && !city && lat == null && lng == null && !timeZone && !colo) return null;
  return {
    country: country || undefined,
    region: region || undefined,
    city: city || undefined,
    lat,
    lng,
    timeZone: timeZone || undefined,
    colo: colo || undefined,
  };
}

export function isTorontoLikeOrigin(hint: {
  city?: string;
  label?: string;
  lat?: number;
  lng?: number;
} | null | undefined) {
  if (!hint) return false;
  const city = cityFromHint({ city: hint.city || hint.label, lat: hint.lat, lng: hint.lng });
  if (city?.label === TORONTO.label) return true;
  if (
    typeof hint.lat === "number" &&
    typeof hint.lng === "number" &&
    haversineKm({ lat: hint.lat, lng: hint.lng }, TORONTO) <= 8
  ) {
    return true;
  }
  const label = (hint.label || hint.city || "").trim().toLowerCase();
  if (label === "toronto" || label.startsWith("toronto,")) return true;
  return false;
}

export function localeSuggestsManitoba(input: {
  timeZone?: string | null;
  ip?: IpGeoHint | null;
} = {}) {
  if (timezoneLooksLikeManitoba(input.timeZone) || timezoneLooksLikeManitoba(input.ip?.timeZone)) {
    return true;
  }
  if (normalizeRegion(input.ip?.region) === "MB") return true;
  if (cityFromHint(input.ip)?.province === "MB") return true;
  return false;
}

/**
 * Inferred Toronto (IP / coarse GPS / ON-only headers / GTA edge colo) is the
 * usual wrong “Canada default”. Explicit Toronto search is not handled here.
 */
export function isUntrustedAnonymousToronto(hint: {
  city?: string;
  region?: string;
  lat?: number;
  lng?: number;
  timeZone?: string;
  colo?: string;
}) {
  if (isTorontoLikeOrigin(hint)) return true;
  const namedCity = cityFromHint({ city: hint.city, lat: hint.lat, lng: hint.lng });
  const region = normalizeRegion(hint.region);
  if (region === "ON" && !namedCity) return true;
  const edgeOnly = isTorontoEdgeColo(hint.colo) && !namedCity;
  if (edgeOnly && (region === "ON" || localeSuggestsManitoba({ timeZone: hint.timeZone, ip: hint }))) {
    return true;
  }
  return false;
}

/** Canadian IP with a city or a coordinate inside Canada. A province code alone is not a pin. */
export function isTrustedAnonymousIp(hint: IpGeoHint | null | undefined) {
  if (!hint) return false;
  const country = normalizeCountry(hint.country);
  if (country && country !== "CA") return false;
  const city = cityFromHint(hint);
  const coordsInCanada =
    typeof hint.lat === "number" && typeof hint.lng === "number" && isInCanada(hint.lat, hint.lng);
  if (city && (country === "CA" || !country || coordsInCanada)) return true;
  if (coordsInCanada && (!country || country === "CA")) return true;
  return false;
}

function originForCity(city: (typeof CITIES)[number], source: OriginResolveSource): ResolvedOrigin {
  return { lat: city.lat, lng: city.lng, label: city.label, source };
}

export function originFromIpHint(hint: IpGeoHint | null | undefined): ResolvedOrigin {
  if (!isTrustedAnonymousIp(hint)) return productHomeOrigin();
  const city = cityFromHint(hint);
  if (
    city &&
    typeof hint?.lat === "number" &&
    typeof hint?.lng === "number" &&
    isInCanada(hint.lat, hint.lng)
  ) {
    return { lat: hint.lat, lng: hint.lng, label: city.label, source: "ip" };
  }
  if (city) return originForCity(city, "ip");
  if (
    hint &&
    typeof hint.lat === "number" &&
    typeof hint.lng === "number" &&
    isInCanada(hint.lat, hint.lng)
  ) {
    return { lat: hint.lat, lng: hint.lng, label: "", source: "ip" };
  }
  return productHomeOrigin();
}

export function placesBiasOrigin(origin?: Partial<LatLng> | null): SearchOrigin {
  if (
    origin &&
    typeof origin.lat === "number" &&
    typeof origin.lng === "number" &&
    isInCanada(origin.lat, origin.lng)
  ) {
    return { lat: origin.lat, lng: origin.lng, label: "" };
  }
  return PRODUCT_HOME;
}

export function originFromDeviceFix(
  fix: DeviceFix | null | undefined,
  _fallback: SearchOrigin = PRODUCT_HOME,
  _locale?: { timeZone?: string | null; ip?: IpGeoHint | null },
): ResolvedOrigin {
  if (!fix || !isInCanada(fix.lat, fix.lng)) {
    return productHomeOrigin();
  }
  const city = cityFromHint(fix);
  return { lat: fix.lat, lng: fix.lng, label: city?.label || "", source: "gps" };
}

/**
 * Saved Toronto is only a “choice” when the parent typed/picked it or we
 * stored street GPS. Old kidease-origin blobs from the pre-Winnipeg default
 * look like `{ lat, lng, label: "Toronto, ON" }` with no explicit flag.
 */
export function isExplicitSavedOrigin(saved: SavedOriginHint | null | undefined) {
  return saved?.explicit === true;
}

export function trustedSavedOrigin(
  saved: SavedOriginHint | null | undefined,
  _locale: { timeZone?: string | null; ip?: IpGeoHint | null } = {},
): SearchOrigin | null {
  if (!saved || typeof saved.lat !== "number" || typeof saved.lng !== "number") return null;
  if (!isInCanada(saved.lat, saved.lng)) return null;
  const label = (saved.label || "").trim();
  if (!label) return null;
  return {
    lat: saved.lat,
    lng: saved.lng,
    label,
    explicit: saved.explicit === true,
  };
}

export function shouldRequestExploreGeolocation(input: {
  consent?: string | null;
  savedTrusted?: boolean;
}) {
  if (input.consent === "denied") return false;
  if (input.consent === "granted") return true;
  return !input.savedTrusted;
}

export function resolveDefaultSearchOrigin(input: {
  saved?: SavedOriginHint | null;
  gps?: DeviceFix | null;
  gpsAllowed?: boolean;
  ip?: IpGeoHint | null;
  fallback?: SearchOrigin | null;
  timeZone?: string | null;
}): ResolvedOrigin {
  const locale = { timeZone: input.timeZone, ip: input.ip };

  if (input.gpsAllowed && input.gps && isInCanada(input.gps.lat, input.gps.lng)) {
    return originFromDeviceFix(input.gps, input.fallback || PRODUCT_HOME, locale);
  }

  const saved = trustedSavedOrigin(input.saved, locale);
  if (saved) {
    return { ...saved, source: "saved" };
  }

  if (input.ip) {
    const fromIp = originFromIpHint({
      ...input.ip,
      timeZone: input.ip.timeZone || input.timeZone || undefined,
    });
    if (fromIp.source === "ip") return fromIp;
  }

  if (
    input.fallback &&
    (input.fallback.label || "").trim() &&
    isInCanada(input.fallback.lat, input.fallback.lng)
  ) {
    return { ...input.fallback, label: input.fallback.label, source: "ip" };
  }

  return productHomeOrigin();
}

/**
 * Kept for callers. A Canadian city from IP or GPS is a real place, including
 * Toronto. The neutral Canada view is not a city, so it is never "untrusted Toronto".
 */
export function isUntrustedTorontoOrigin(origin: SearchOrigin | null | undefined) {
  if (!origin) return false;
  if (!(origin.label || "").trim()) return false;
  return false;
}

export function resolveAnonymousOriginFromHeaders(
  headers: HeaderReader | null | undefined,
): ResolvedOrigin {
  const hint = parseIpGeoHeaders(headers);
  const fromIp = originFromIpHint(hint);
  // A Manitoba region with a pin outside the province is not the parent.
  // A matching city pin (Toronto, Edmonton) stays, even if the clock says Winnipeg.
  if (normalizeRegion(hint?.region) === "MB" && !originInManitoba(fromIp)) {
    return { lat: WINNIPEG.lat, lng: WINNIPEG.lng, label: WINNIPEG.label, source: "ip" };
  }
  return fromIp;
}
