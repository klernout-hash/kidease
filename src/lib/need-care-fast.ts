/**
 * Need care fast: public listings with open spots confirmed in the last 7 days,
 * closest first. No invented spots or timestamps.
 */

export const NEED_CARE_FAST_MS = 7 * 24 * 60 * 60 * 1000;
export const NEED_CARE_FAST_CAP = 40;

export function qualifiesNeedCareFast(
  row: { spots: number; confirmedAt: string | null | undefined },
  now: number,
): boolean {
  if (!Number.isFinite(row.spots) || row.spots <= 0) return false;
  const ts = Date.parse(String(row.confirmedAt || ""));
  if (!Number.isFinite(ts)) return false;
  const age = now - ts;
  return age >= 0 && age <= NEED_CARE_FAST_MS;
}

export function rankNeedCareFast<T extends { distanceKm: number; confirmedAt: string }>(rows: readonly T[]): T[] {
  return rows
    .slice()
    .sort((a, b) => a.distanceKm - b.distanceKm || b.confirmedAt.localeCompare(a.confirmedAt))
    .slice(0, NEED_CARE_FAST_CAP);
}

export function formatFastKm(km: number): string {
  if (!Number.isFinite(km) || km < 0) return "";
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}
