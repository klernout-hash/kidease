/**
 * Street matching for Need care fast.
 * OpenStreetMap Nominatim only. Never Google.
 * FEATURE_NCF_STREET defaults off. City search does not call Nominatim.
 */
import { createHash } from "node:crypto";
import { ncfStreetEnabled, type EnvMap } from "./features.ts";

export const NOMINATIM_ORIGIN = "https://nominatim.openstreetmap.org";
export const NCF_STREET_RADIUS_KM = 15;
export const NOMINATIM_USER_AGENT = "KidEase/1.0 (https://www.kidease.ca; support@kidease.ca)";

const STREET_WORD =
  /\b(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|cres|crescent|way|lane|ln|rue|chemin|place|pl|court|ct|trail|terr|terrace)\b/i;

export type StreetPin = { lat: number; lng: number; label: string };

export type StreetGeocodeCache = {
  get(hash: string): Promise<StreetPin | null>;
  set(hash: string, pin: StreetPin): Promise<void>;
};

export function looksLikeStreetAddress(query: string): boolean {
  const q = String(query || "").trim();
  if (!q || q.length > 160 || !/\d/.test(q)) return false;
  if (STREET_WORD.test(q)) return true;
  return /^\d{1,6}\s+\S+/.test(q) && q.includes(",");
}

export function normalizeStreetQuery(query: string): string {
  return String(query || "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 160);
}

export function streetQueryHash(query: string): string {
  return createHash("sha256").update(normalizeStreetQuery(query)).digest("hex");
}

export function nominatimSearchUrl(query: string): string {
  const url = new URL("/search", NOMINATIM_ORIGIN);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "ca");
  url.searchParams.set("q", normalizeStreetQuery(query));
  return url.toString();
}

export function parseNominatimBody(body: unknown): StreetPin | null {
  const row = Array.isArray(body) ? body[0] : null;
  if (!row || typeof row !== "object") return null;
  const rec = row as { lat?: unknown; lon?: unknown; display_name?: unknown };
  const lat = Number(rec.lat);
  const lng = Number(rec.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < 41 || lat > 84 || lng < -141 || lng > -52) return null;
  const label = String(rec.display_name || "")
    .split(",")
    .slice(0, 3)
    .join(",")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  if (!label) return null;
  return { lat, lng, label };
}

export function withinStreetRadius(km: number, radiusKm = NCF_STREET_RADIUS_KM): boolean {
  return Number.isFinite(km) && km >= 0 && km <= radiusKm;
}

const EMPTY_CACHE: StreetGeocodeCache = {
  async get() {
    return null;
  },
  async set() {
    return undefined;
  },
};

export async function geocodeStreetAddress(
  query: string,
  options: {
    enabled?: boolean;
    env?: EnvMap;
    fetchImpl?: typeof fetch;
    cache?: StreetGeocodeCache;
    timeoutMs?: number;
  } = {},
): Promise<StreetPin | null> {
  const enabled = options.enabled ?? ncfStreetEnabled(options.env);
  if (!enabled || !looksLikeStreetAddress(query)) return null;
  const cache = options.cache ?? EMPTY_CACHE;
  const hash = streetQueryHash(query);
  const cached = await cache.get(hash).catch(() => null);
  if (cached) return cached;
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 4000);
  try {
    const res = await fetchImpl(nominatimSearchUrl(query), {
      headers: {
        accept: "application/json",
        "user-agent": NOMINATIM_USER_AGENT,
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const pin = parseNominatimBody(await res.json());
    if (!pin) return null;
    await cache.set(hash, pin).catch(() => undefined);
    return pin;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
