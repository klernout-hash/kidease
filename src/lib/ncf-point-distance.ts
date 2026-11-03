/**
 * Need care fast distance from a parent point to a listing pin.
 * FEATURE_NCF_POINT_DISTANCE defaults off. Home daycares use a coarse pin.
 * This module never returns a street address.
 */
import { approximateHomePoint } from "./home-address-seal.ts";
import { isHomeDaycare, type HomeSignals } from "./home-address-privacy.ts";

export type ListingPointInput = HomeSignals & {
  id: string;
  lat: number;
  lng: number;
};

export type DistancePoint = { lat: number; lng: number; coarse: boolean };

/** Exact pin for a centre. Coarse pin for a home daycare that is not public. */
export function listingDistancePoint(row: ListingPointInput): DistancePoint {
  const home = isHomeDaycare(row);
  const publicHome = row.showPublicAddress === true || row.show_public_address === true || row.show_public_address === 1;
  if (home && !publicHome && Number.isFinite(row.lat) && Number.isFinite(row.lng)) {
    const approx = approximateHomePoint(row.id, row.lat, row.lng);
    return { lat: approx.lat, lng: approx.lng, coarse: true };
  }
  return { lat: row.lat, lng: row.lng, coarse: false };
}

export function isDevicePoint(lat: unknown, lng: unknown): lat is number {
  const latitude = Number(lat);
  const longitude = Number(lng);
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= 41 && latitude <= 84 && longitude >= -141 && longitude <= -52;
}

/** Canadian postal code, with or without a space. Not a city name. */
export function isCanadianPostal(value: string): boolean {
  const compact = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(compact);
}
