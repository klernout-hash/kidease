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
