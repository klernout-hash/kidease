/**
 * Inspection rows with a public source and date. KidEase does not invent
 * an outcome. FEATURE_INSPECTION_SYNC defaults off.
 */

import { parseInspectionCache, type InspectionRecord, type PublicInspection } from "../inspection-history.ts";
import { governmentSeesProvince, wiringEnabled, wiringMode } from "./common.ts";

export const INSPECTION_SYNC_FLAG = "FEATURE_INSPECTION_SYNC";

export function inspectionSyncEnabled(env?: Record<string, string | undefined>): boolean {
  return wiringEnabled(INSPECTION_SYNC_FLAG, env);
}

export function inspectionSyncMode(env?: Record<string, string | undefined>, dry = false) {
  return wiringMode(INSPECTION_SYNC_FLAG, env, dry);
}

export function acceptInspection(raw: unknown): InspectionRecord | { error: "source" } {
  const rows = parseInspectionCache(Array.isArray(raw) ? raw : [raw]);
  const row = rows[0];
  if (!row) return { error: "source" };
  return row;
}

export function inspectionSummary(rows: readonly PublicInspection[]): (PublicInspection & { source: string }) | null {
  const dated = rows.filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.inspectedOn) && row.sourceUrl && row.outcome);
  if (!dated.length) return null;
  const newest = [...dated].sort((a, b) => (a.inspectedOn < b.inspectedOn ? 1 : -1))[0]!;
  return { ...newest, source: newest.sourceUrl };
}

export function inspectionProvinceOk(actorProvince: string, recordProvince: string): boolean {
  return governmentSeesProvince({ actorProvince, recordProvince });
}
