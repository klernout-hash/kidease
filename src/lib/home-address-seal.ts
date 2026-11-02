/**
 * Home address redaction. No database and no session.
 * The offset stays here so a public page cannot reverse the circle.
 */

import {
  approximateDistanceKm,
  homeAddressIsPublic,
  isHomeDaycare,
  postalFsa,
  publicHomePlace,
  type HomeSignals,
} from "./home-address-privacy.ts";
import type { MapCluster, MapPin, MapViewData } from "./map-cluster.ts";

const EARTH_M = 6_371_000;

export type HomeViewer = {
  userId: string | null;
  revealAll: boolean;
  revealIds: Set<string>;
};

export const GUEST_HOME_VIEWER: HomeViewer = {
  userId: null,
  revealAll: false,
  revealIds: new Set(),
};

type HomeRecord = HomeSignals & {
  id: string;
  lat: number;
  lng: number;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  postal_code?: string | null;
  neighbourhood?: string | null;
  googlePlaceId?: string | null;
  description?: string | null;
  descriptionFr?: string | null;
  tagline?: string | null;
  taglineFr?: string | null;
  promoText?: string | null;
  valuesNote?: string | null;
  hours?: string | null;
  hoursFr?: string | null;
  distanceKm?: number;
  addressProtected?: boolean;
  mapRadiusM?: number | null;
  addressPlace?: string | null;
  distanceApproximate?: boolean;
  [key: string]: unknown;
};

const TEXT_KEYS = [
  "description",
  "descriptionFr",
  "tagline",
  "taglineFr",
  "promoText",
  "valuesNote",
  "hours",
  "hoursFr",
] as const;

function hash32(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function roundCoord(value: number): number {
  return Math.round(value * 1e5) / 1e5;
}

/**
 * Stable point 35–60% of the way from the door to the edge of a 500–1000 m
 * circle. The same listing id always lands on the same point.
 */
export function approximateHomePoint(
  id: string,
  lat: number,
  lng: number,
): { lat: number; lng: number; radiusM: number } {
  const radiusM = 500 + (hash32(`ke-home-radius:${id}`) % 501);
  const fraction = 0.35 + (hash32(`ke-home-frac:${id}`) % 26) / 100;
  const offsetM = Math.round(radiusM * fraction);
  const bearing = ((hash32(`ke-home-bearing:${id}`) % 3600) / 10) * (Math.PI / 180);
  const latR = (lat * Math.PI) / 180;
  const lngR = (lng * Math.PI) / 180;
  const ang = offsetM / EARTH_M;
  const lat2 = Math.asin(
    Math.sin(latR) * Math.cos(ang) + Math.cos(latR) * Math.sin(ang) * Math.cos(bearing),
  );
  const lng2 =
    lngR +
    Math.atan2(
      Math.sin(bearing) * Math.sin(ang) * Math.cos(latR),
      Math.cos(ang) - Math.sin(latR) * Math.sin(lat2),
    );
  return {
    lat: roundCoord((lat2 * 180) / Math.PI),
    lng: roundCoord(((((lng2 * 180) / Math.PI + 540) % 360) - 180)),
    radiusM,
  };
}

export function circleBounds(lat: number, lng: number, radiusM: number) {
  const dLat = radiusM / 111_320;
  const cos = Math.cos((lat * Math.PI) / 180);
  const dLng = radiusM / (111_320 * (Math.abs(cos) < 0.2 ? 0.2 : Math.abs(cos)));
  return {
    minLat: lat - dLat,
    maxLat: lat + dLat,
    minLng: lng - dLng,
    maxLng: lng + dLng,
  };
}

function postalOf(row: HomeRecord): string {
  return String(row.postalCode || row.postal_code || "");
}

function scrubText(value: string, secrets: string[]): string {
  let next = value;
  for (const secret of secrets) {
    const token = secret.trim();
    if (token.length < 4) continue;
    next = next.split(token).join(" ");
  }
  return next
    .replace(/\bat\s*,/gi, "in")
    .replace(/\bau\s*,/gi, "à")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/\s+\./g, ".")
    .trim();
}

function secretTokens(address: string, postal: string): string[] {
  const compact = postal.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const spaced = compact.length === 6 ? `${compact.slice(0, 3)} ${compact.slice(3)}` : "";
  return [address, postal, compact, spaced].filter((token) => token.trim().length >= 4);
}

export function viewerSeesHome(viewer: HomeViewer, row: HomeSignals & { id?: string | null }): boolean {
  const home = isHomeDaycare(row) || row.protectedHome === true;
  if (!home) return true;
  if (homeAddressIsPublic(row)) return true;
  if (viewer.revealAll) return true;
  const id = String(row.id || "");
  return Boolean(id) && viewer.revealIds.has(id);
}

export function protectHomeRecord<T extends HomeRecord>(row: T, seeExact: boolean): T {
  if (!isHomeDaycare(row) || seeExact) {
    return { ...row, addressProtected: false, mapRadiusM: null, distanceApproximate: false };
  }
  const address = String(row.address || "");
  const postal = postalOf(row);
  const approx = approximateHomePoint(row.id, Number(row.lat), Number(row.lng));
  const tokens = secretTokens(address, postal);
  const next = { ...row };
  next.address = "";
  next.postalCode = postalFsa(postal);
  if ("postal_code" in next) next.postal_code = next.postalCode;
  next.lat = approx.lat;
  next.lng = approx.lng;
  next.addressProtected = true;
  next.mapRadiusM = approx.radiusM;
  next.addressPlace = publicHomePlace({
    city: row.city,
    neighbourhood: row.neighbourhood,
    postalCode: postal,
  });
  next.distanceApproximate = true;
  next.googlePlaceId = null;
  if (typeof next.distanceKm === "number") {
    next.distanceKm = approximateDistanceKm(next.distanceKm);
  }
  for (const key of TEXT_KEYS) {
    const value = next[key];
    if (typeof value === "string" && value) next[key] = scrubText(value, tokens);
  }
  return next;
}

function isRecord(value: unknown): value is HomeRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as HomeRecord;
  return typeof row.id === "string" && row.id.length > 0 && typeof row.lat === "number" && typeof row.lng === "number";
}

function collectSecrets(value: unknown, viewer: HomeViewer, out: Array<{ address: string; postal: string; lat: number; lng: number }>) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectSecrets(item, viewer, out);
    return;
  }
  if (isRecord(value) && isHomeDaycare(value) && !viewerSeesHome(viewer, value)) {
    out.push({
      address: String(value.address || ""),
      postal: postalOf(value),
      lat: Number(value.lat),
      lng: Number(value.lng),
    });
  }
  for (const item of Object.values(value)) collectSecrets(item, viewer, out);
}

function coordsMatch(lat: number, lng: number, secret: { lat: number; lng: number }): boolean {
  return Math.abs(lat - secret.lat) < 1e-4 && Math.abs(lng - secret.lng) < 1e-4;
}

function scrubNode(value: unknown, secrets: Array<{ address: string; postal: string; lat: number; lng: number }>): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) scrubNode(item, secrets);
    return;
  }
  const row = value as Record<string, unknown>;
  if (typeof row.lat === "number" && typeof row.lng === "number") {
    const hit = secrets.find((secret) => coordsMatch(row.lat as number, row.lng as number, secret));
    if (hit && typeof row.id === "string") {
      const approx = approximateHomePoint(row.id, hit.lat, hit.lng);
      row.lat = approx.lat;
      row.lng = approx.lng;
      if (typeof row.address === "string") row.address = "";
      if (typeof row.postalCode === "string") row.postalCode = postalFsa(hit.postal);
      row.mapRadiusM = approx.radiusM;
      row.addressProtected = true;
    }
  }
  for (const [key, item] of Object.entries(row)) {
    if (typeof item === "string") {
      const tokens = secrets.flatMap((secret) => secretTokens(secret.address, secret.postal));
      const next = scrubText(item, tokens);
      if (next !== item) row[key] = next;
    } else {
      scrubNode(item, secrets);
    }
  }
}

/** Clone a public payload and strip home streets and exact coordinates. */
export function sealHomeRecords<T>(value: T, viewer: HomeViewer = GUEST_HOME_VIEWER): T {
  const secrets: Array<{ address: string; postal: string; lat: number; lng: number }> = [];
  collectSecrets(value, viewer, secrets);
  let clone = structuredClone(value) as T;
  if (isRecord(clone) && isHomeDaycare(clone) && !viewerSeesHome(viewer, clone)) {
    clone = protectHomeRecord(clone, false) as T;
  }
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i += 1) {
        if (isRecord(node[i]) && isHomeDaycare(node[i]) && !viewerSeesHome(viewer, node[i])) {
          node[i] = protectHomeRecord(node[i], false);
        } else {
          walk(node[i]);
        }
      }
      return;
    }
    const row = node as Record<string, unknown>;
    for (const key of Object.keys(row)) {
      const child = row[key];
      if (isRecord(child) && isHomeDaycare(child) && !viewerSeesHome(viewer, child)) {
        row[key] = protectHomeRecord(child, false);
      } else {
        walk(child);
      }
    }
  };
  walk(clone);
  if (secrets.length) scrubNode(clone, secrets);
  return clone;
}

export function presentPin(pin: MapPin, viewer: HomeViewer): MapPin {
  const { protectedHome: _home, showPublicAddress, facilityType: _type, amenities: _amenities, ...rest } = pin;
  const home = Boolean(pin.protectedHome) || isHomeDaycare(pin);
  if (!home || viewerSeesHome(viewer, { ...pin, showPublicAddress })) {
    return { ...rest, radiusM: undefined };
  }
  const approx = approximateHomePoint(pin.id, pin.lat, pin.lng);
  return {
    ...rest,
    lat: approx.lat,
    lng: approx.lng,
    address: "",
    postalCode: postalFsa(pin.postalCode),
    radiusM: approx.radiusM,
  };
}

export function presentMapView(view: MapViewData, viewer: HomeViewer): MapViewData {
  if (view.mode === "pins") {
    return { ...view, pins: view.pins.map((pin) => presentPin(pin, viewer)) };
  }
  return {
    ...view,
    clusters: view.clusters.map((cluster) => presentCluster(cluster, viewer)),
  };
}

function presentCluster(cluster: MapCluster, viewer: HomeViewer): MapCluster {
  if (!cluster.pin || cluster.count !== 1) {
    if (!cluster.pin) return cluster;
    return { ...cluster, pin: presentPin(cluster.pin, viewer) };
  }
  const pin = presentPin(cluster.pin, viewer);
  if (!pin.radiusM) return { ...cluster, pin };
  return {
    ...cluster,
    lat: pin.lat,
    lng: pin.lng,
    ...circleBounds(pin.lat, pin.lng, pin.radiusM),
    pin,
  };
}
