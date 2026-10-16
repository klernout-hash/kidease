import centroids from "./data/fsa-centroids.json" with { type: "json" };
import { isInCanada } from "./canada-origin.ts";

/**
 * Forward sortation area centroids for Canadian postal codes.
 * Source: GeoNames Canada postal codes (CC BY 4.0). These are area centres,
 * not building pins. The catalogue seed uses one only after a real postal,
 * FSA, or city coordinate is missing.
 */
const TABLE = centroids as unknown as Record<string, readonly [number, number]>;

export function fsaCentroid(postal: string | null | undefined): { lat: number; lng: number } | null {
  const compact = (postal || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (compact.length < 3) return null;
  const hit = TABLE[compact.slice(0, 3)];
  if (!hit || hit.length < 2) return null;
  const lat = Number(hit[0]);
  const lng = Number(hit[1]);
  if (!isInCanada(lat, lng)) return null;
  return { lat, lng };
}
