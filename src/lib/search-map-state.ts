import { haversineKm, type LatLng } from "./geo.ts";
import type { MapPin } from "./map-cluster.ts";
import type { SearchEvidence } from "./search-evidence.ts";

export type SearchMapResult = { key: string; pins: MapPin[]; total: number; evidence: SearchEvidence };

/** A pending or invalid location must never expose a previous search's pins. */
export function searchMapState(input: { canSearch: boolean; key: string; result: SearchMapResult | null; failedKey: string | null; pendingKey?: string | null }) {
  if (!input.canSearch) return { kind: "location" as const, result: null };
  if (input.failedKey === input.key) return { kind: "error" as const, result: null };
  if (input.pendingKey === input.key) return { kind: "loading" as const, result: null };
  if (input.result?.key === input.key) return { kind: "ready" as const, result: input.result };
  return { kind: "loading" as const, result: null };
}

/**
 * The first map read can fail on a cold server. Try again after these waits
 * before showing "Map results could not be loaded".
 */
export const MAP_RETRY_DELAYS_MS = [800, 2_000] as const;

/** Wait before retry number `attempt` (0-based), or null when retries are used up. */
export function mapRetryDelay(attempt: number): number | null {
  return attempt >= 0 && attempt < MAP_RETRY_DELAYS_MS.length ? MAP_RETRY_DELAYS_MS[attempt]! : null;
}

/** Pins inside the search circle. A 25 km search never shows a pin 300 km away. */
export function pinsWithinRadius<T extends { lat: number; lng: number }>(pins: readonly T[], origin: LatLng, radiusKm: number): T[] {
  const radius = Number(radiusKm);
  if (!Number.isFinite(radius) || radius <= 0) return [...pins];
  if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) return [...pins];
  return pins.filter((pin) => Number.isFinite(pin.lat) && Number.isFinite(pin.lng) && haversineKm(origin, pin) <= radius);
}
