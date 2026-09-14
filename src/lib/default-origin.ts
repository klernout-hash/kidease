import { canadaOriginOrWinnipeg, isInCanada } from "./canada-origin.ts";
import { CITIES, PROVINCES, WINNIPEG, haversineKm, type LatLng } from "./geo.ts";

/**
 * Default Explore / search center.
 *
 * KidEase is a Canada-wide proximity product founded in Winnipeg. Anonymous
 * first paint must not silently become Toronto because a CDN, Vercel/CF IP
 * header, CF colo (YYZ), Vercel iad mis-map, IP-based “GPS”, or an old
 * default that was persisted to localStorage.
 *
 * Priority (first match wins):
 *  1. Explicit query / city chip / Places pick — caller applies this (multi-city).
 *  2. Street-grade GPS in Canada (request on Explore when consent is not denied
 *     and there is no trusted saved city). Laptop/IP “GPS” that lands on
 *     Toronto is rejected when the locale is Manitoba / America/Winnipeg.
 *  3. Saved origin the parent already chose (explicit typed/chip/Places, or
 *     earlier street GPS). Stale inferred Toronto is not a choice.
 *  4. Trusted anonymous IP: Manitoba, or another Canadian city whose province
 *     matches the header — except inferred Toronto (common wrong CA default).
 *  5. Winnipeg, MB.
 *
 * Typed “Toronto” and a street-grade Toronto fix still work.
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

export const PRODUCT_HOME: SearchOrigin = {
  lat: WINNIPEG.lat,
  lng: WINNIPEG.lng,
  label: WINNIPEG.label,
};

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

function cityFromHint(hint: { city?: string; lat?: number; lng?: number } | null | undefined) {
  const name = (hint?.city || "").trim().toLowerCase();
  if (name) {
    const byName = CITIES.find(
      (c) =>
        c.label.toLowerCase() === name ||
        c.label.toLowerCase().startsWith(`${name},`) ||
        c.aliases.some((a) => a === name),
    );
    if (byName) return byName;
  }
  if (
    typeof hint?.lat === "number" &&
    typeof hint?.lng === "number" &&
    isInCanada(hint.lat, hint.lng)
  ) {
    const here = { lat: hint.lat, lng: hint.lng };
    let best = CITIES[0]!;
    let bestD = Infinity;
    for (const c of CITIES) {
      const d = haversineKm(here, c);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    if (bestD <= 40) return best;
  }
  return null;
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

export function isTrustedAnonymousIp(hint: IpGeoHint | null | undefined) {
  if (!hint) return false;
  const country = normalizeCountry(hint.country);
  if (country && country !== "CA") return false;
  const region = normalizeRegion(hint.region);
  if (region === "MB") return true;
  const city = cityFromHint(hint);
  if (city?.province === "MB") return true;
  if (isUntrustedAnonymousToronto(hint)) return false;
  if (
    localeSuggestsManitoba({ timeZone: hint.timeZone, ip: hint }) &&
    isTorontoLikeOrigin(hint)
  ) {
    return false;
  }
  if (city && (!region || region === city.province)) {
    if (country === "CA" || region || (hint.lat != null && hint.lng != null && isInCanada(hint.lat, hint.lng))) {
      return true;
    }
  }
  if (region && region !== "ON" && country === "CA") return true;
  return false;
}

function originForCity(city: (typeof CITIES)[number], source: OriginResolveSource): ResolvedOrigin {
  return { lat: city.lat, lng: city.lng, label: city.label, source };
}

export function originFromIpHint(hint: IpGeoHint | null | undefined): ResolvedOrigin {
  if (!isTrustedAnonymousIp(hint)) return productHomeOrigin();
  const city = cityFromHint(hint);
  if (city) {
    if (isTorontoLikeOrigin(city) && localeSuggestsManitoba({ timeZone: hint?.timeZone, ip: hint })) {
      return productHomeOrigin();
    }
    if (
      typeof hint?.lat === "number" &&
      typeof hint?.lng === "number" &&
      isInCanada(hint.lat, hint.lng)
    ) {
      return { lat: hint.lat, lng: hint.lng, label: city.label, source: "ip" };
    }
    return originForCity(city, "ip");
  }
  const region = normalizeRegion(hint?.region);
  const prov = PROVINCES.find((p) => p.code === region);
  if (prov && prov.code !== "ON") {
    return { lat: prov.lat, lng: prov.lng, label: prov.label, source: "ip" };
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
    return {
      lat: origin.lat,
      lng: origin.lng,
      label: PRODUCT_HOME.label,
    };
  }
  return PRODUCT_HOME;
}

function gpsConflictsWithManitobaLocale(
  fix: DeviceFix,
  input: { timeZone?: string | null; ip?: IpGeoHint | null },
) {
  if (!isTorontoLikeOrigin(fix)) return false;
  if (!localeSuggestsManitoba(input)) return false;
  return !isStreetGpsFix(fix);
}

export function originFromDeviceFix(
  fix: DeviceFix | null | undefined,
  fallback: SearchOrigin = PRODUCT_HOME,
  locale?: { timeZone?: string | null; ip?: IpGeoHint | null },
): ResolvedOrigin {
  if (!fix || !isInCanada(fix.lat, fix.lng)) {
    return { ...canadaOriginOrWinnipeg(fallback), source: "default" };
  }
  if (locale && gpsConflictsWithManitobaLocale(fix, locale)) {
    return { ...canadaOriginOrWinnipeg(fallback), source: "default" };
  }
  if (isPreciseCanadaFix(fix)) {
    const city = cityFromHint(fix);
    return { lat: fix.lat, lng: fix.lng, label: city?.label || fallback.label, source: "gps" };
  }
  if (isTrustedAnonymousIp({ lat: fix.lat, lng: fix.lng, country: "CA" })) {
    const city = cityFromHint(fix);
    return {
      lat: fix.lat,
      lng: fix.lng,
      label: city?.label || fallback.label,
      source: "gps",
    };
  }
  return { ...canadaOriginOrWinnipeg(fallback), source: "default" };
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
  locale: { timeZone?: string | null; ip?: IpGeoHint | null } = {},
): SearchOrigin | null {
  if (!saved || typeof saved.lat !== "number" || typeof saved.lng !== "number") return null;
  if (!isInCanada(saved.lat, saved.lng)) return null;
  const origin: SearchOrigin = {
    lat: saved.lat,
    lng: saved.lng,
    label: saved.label || PRODUCT_HOME.label,
    explicit: saved.explicit === true,
  };
  if (!isTorontoLikeOrigin(origin)) return origin;
  if (saved.explicit === true) return origin;
  if (localeSuggestsManitoba(locale)) return null;
  return null;
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

  if (input.gpsAllowed && input.gps && isPreciseCanadaFix(input.gps)) {
    if (!gpsConflictsWithManitobaLocale(input.gps, locale)) {
      const city = cityFromHint(input.gps);
      return {
        lat: input.gps.lat,
        lng: input.gps.lng,
        label: city?.label || input.saved?.label || PRODUCT_HOME.label,
        source: "gps",
      };
    }
  }

  const saved = trustedSavedOrigin(input.saved, locale);
  if (saved) {
    return { ...saved, source: "saved" };
  }

  if (input.gpsAllowed && input.gps && isInCanada(input.gps.lat, input.gps.lng)) {
    const inferred = originFromDeviceFix(input.gps, input.fallback || PRODUCT_HOME, locale);
    if (inferred.source === "gps") return inferred;
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
    isInCanada(input.fallback.lat, input.fallback.lng) &&
    !isUntrustedTorontoOrigin(input.fallback) &&
    !(localeSuggestsManitoba(locale) && isTorontoLikeOrigin(input.fallback))
  ) {
    return { ...input.fallback, source: input.fallback.label === PRODUCT_HOME.label ? "default" : "ip" };
  }

  return productHomeOrigin();
}

/** SSR / CDN Toronto must not become Explore landing unless the parent chose it. */
export function isUntrustedTorontoOrigin(origin: SearchOrigin | null | undefined) {
  if (!origin) return false;
  if (origin.label === PRODUCT_HOME.label) return false;
  return isUntrustedAnonymousToronto({
    city: origin.label,
    lat: origin.lat,
    lng: origin.lng,
  });
}

export function resolveAnonymousOriginFromHeaders(
  headers: HeaderReader | null | undefined,
): ResolvedOrigin {
  return originFromIpHint(parseIpGeoHeaders(headers));
}
