import { haversineKm, type LatLng } from "@/lib/geo";
import type { DaycareCard } from "@/lib/types";

export type OriginSource = "gps" | "manual" | "saved";
export type PresenceFreshness = "live" | "fresh" | "stale" | "unknown";

const LIVE_MS = 90_000;
const FRESH_MS = 10 * 60_000;
const MOVE_KM = 0.15;

export function presenceFreshness(updatedAt: number | null, source: OriginSource | null): PresenceFreshness {
  if (!updatedAt || !source) return "unknown";
  const age = Date.now() - updatedAt;
  if (source === "gps" && age <= LIVE_MS) return "live";
  if (age <= FRESH_MS) return "fresh";
  return "stale";
}

export function movedEnough(from: LatLng, to: LatLng) {
  return haversineKm(from, to) >= MOVE_KM;
}

export function areaPresence(rows: DaycareCard[]) {
  const live = rows.filter((r) => r.live).length;
  const catchment = rows.filter((r) => r.inCatchment).length;
  return { live, catchment, total: rows.length };
}
