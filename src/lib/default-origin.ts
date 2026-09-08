import { canadaOriginOrWinnipeg, isInCanada } from "./canada-origin.ts";
import { CITIES, PROVINCES, WINNIPEG, haversineKm, type LatLng } from "./geo.ts";

/**
 * Default Explore / search center.
 *
 * KidEase is a Canada-wide proximity product founded in Winnipeg. Anonymous
 * first paint must not silently become Toronto because a CDN, Vercel/CF IP
 * header, or coarse browser/Places guess mapped “Canada” to that city.
 *
 * Priority (first match wins):
 *  1. Explicit query / city chip / Places pick — caller applies this (multi-city).
 *  2. Precise GPS in Canada when the parent granted when-in-use location.
 *  3. Saved origin the parent already chose (typed, chip, or earlier precise GPS).
 *  4. Trusted anonymous IP: Manitoba, or another Canadian city whose province
 *     matches the header — except inferred Toronto (common wrong CA default).
 *  5. Winnipeg, MB.
 *
 * Coarse GPS / IP-level accuracy uses the same trust rules as (4). Typed
 * “Toronto” and a precise Toronto fix still work.
 */

export type SearchOrigin = LatLng & { label: string };

export type OriginResolveSource = "gps" | "manual" | "saved" | "ip" | "default";

export type HeaderReader = { get(name: string): string | null };

export type IpGeoHint = {
  lat?: number;
  lng?: number;
  city?: string;
  region?: string;
  country?: string;
};

export type DeviceFix = LatLng & { accuracyM?: number };

export type ResolvedOrigin = SearchOrigin & { source: OriginResolveSource };

export const PRODUCT_HOME: SearchOrigin = {
  lat: WINNIPEG.lat,
  lng: WINNIPEG.lng,
  label: WINNIPEG.label,
};

/** Cell / IP-class accuracy. Street GPS is typically well under 1 km. */
export const COARSE_ACCURACY_M = 25_000;

const TORONTO = CITIES.find((c) => c.label === "Toronto, ON")!;

export function productHomeOrigin(): ResolvedOrigin {
  return { ...PRODUCT_HOME, source: "default" };
}

export function isCoarseFix(fix: Pick<DeviceFix, "accuracyM"> | null | undefined) {
  const accuracy = fix?.accuracyM;
  return typeof accuracy === "number" && Number.isFinite(accuracy) && accuracy > COARSE_ACCURACY_M;
}

export function isPreciseCanadaFix(fix: DeviceFix | null | undefined) {
  if (!fix || !isInCanada(fix.lat, fix.lng)) return false;
  return !isCoarseFix(fix);
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
  if (!country && !region && !city && lat == null && lng == null) return null;
  return {
    country: country || undefined,
    region: region || undefined,
    city: city || undefined,
    lat,
    lng,
  };
}

/**
 * Inferred Toronto (IP / coarse GPS / ON-only headers) is the usual wrong
 * “Canada default”. Explicit Toronto search is not handled here.
 */
export function isUntrustedAnonymousToronto(hint: {
  city?: string;
  region?: string;
  lat?: number;
  lng?: number;
}) {
  const city = cityFromHint(hint);
  if (city?.label === TORONTO.label) return true;
  if (
    typeof hint.lat === "number" &&
    typeof hint.lng === "number" &&
    haversineKm({ lat: hint.lat, lng: hint.lng }, TORONTO) <= 8
  ) {
    return true;
  }
  const region = normalizeRegion(hint.region);
  if (region === "ON" && !cityFromHint({ city: hint.city })) return true;
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

export function originFromDeviceFix(
  fix: DeviceFix | null | undefined,
  fallback: SearchOrigin = PRODUCT_HOME,
): ResolvedOrigin {
  if (!fix || !isInCanada(fix.lat, fix.lng)) {
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

export function resolveDefaultSearchOrigin(input: {
  saved?: (Partial<LatLng> & { label?: string }) | null;
  gps?: DeviceFix | null;
  gpsAllowed?: boolean;
  ip?: IpGeoHint | null;
  fallback?: SearchOrigin | null;
}): ResolvedOrigin {
  if (input.gpsAllowed && isPreciseCanadaFix(input.gps)) {
    const city = cityFromHint(input.gps!);
    return {
      lat: input.gps!.lat,
      lng: input.gps!.lng,
      label: city?.label || input.saved?.label || PRODUCT_HOME.label,
      source: "gps",
    };
  }

  const saved = input.saved;
  if (
    saved &&
    typeof saved.lat === "number" &&
    typeof saved.lng === "number" &&
    isInCanada(saved.lat, saved.lng)
  ) {
    return {
      lat: saved.lat,
      lng: saved.lng,
      label: saved.label || PRODUCT_HOME.label,
      source: "saved",
    };
  }

  if (input.gpsAllowed && input.gps && isInCanada(input.gps.lat, input.gps.lng)) {
    const inferred = originFromDeviceFix(input.gps, input.fallback || PRODUCT_HOME);
    if (inferred.source === "gps") return inferred;
  }

  if (input.ip) {
    const fromIp = originFromIpHint(input.ip);
    if (fromIp.source === "ip") return fromIp;
  }

  if (input.fallback && isInCanada(input.fallback.lat, input.fallback.lng)) {
    return { ...input.fallback, source: input.fallback.label === PRODUCT_HOME.label ? "default" : "ip" };
  }

  return productHomeOrigin();
}

export function resolveAnonymousOriginFromHeaders(
  headers: HeaderReader | null | undefined,
): ResolvedOrigin {
  return originFromIpHint(parseIpGeoHeaders(headers));
}
