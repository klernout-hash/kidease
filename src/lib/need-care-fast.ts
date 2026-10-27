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

/** Never throws. /search can hand over an empty city, a number, or extra filters. */
export function parseNeedCareFastSearch(search: unknown): { q: string } {
  const bag = search && typeof search === "object" ? (search as Record<string, unknown>) : {};
  const raw = typeof bag.q === "string" ? bag.q : Array.isArray(bag.q) && typeof bag.q[0] === "string" ? bag.q[0] : bag.city;
  const text = typeof raw === "string" ? raw : "";
  return { q: text.trim().slice(0, 80) };
}

export function needCareFastQuery(value: unknown): string {
  if (typeof value === "string") return value.trim().slice(0, 80);
  if (value && typeof value === "object" && "q" in value) {
    return needCareFastQuery((value as { q?: unknown }).q);
  }
  return "";
}

export type NeedCareFastHitView = {
  id: string;
  slug: string;
  name: string;
  city: string;
  province: string;
  spots: number;
  confirmedAt: string;
  distanceKm: number;
  distanceLabel: string;
};

export type NeedCareFastViewData = {
  q: string;
  placeLabel: string | null;
  unknownPlace: boolean;
  hits: NeedCareFastHitView[];
};

/** A missing or odd loader payload becomes an empty page, not a crash. */
export function normalizeNeedCareFastPage(data: unknown): NeedCareFastViewData {
  const bag = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const q = typeof bag.q === "string" ? bag.q : "";
  const rawHits = Array.isArray(bag.hits) ? bag.hits : [];
  const hits = rawHits.flatMap((row): NeedCareFastHitView[] => {
    if (!row || typeof row !== "object") return [];
    const hit = row as Record<string, unknown>;
    if (typeof hit.slug !== "string" || !hit.slug || typeof hit.name !== "string" || !hit.name) return [];
    const spots = Number(hit.spots);
    const distanceKm = Number(hit.distanceKm);
    return [{
      id: typeof hit.id === "string" && hit.id ? hit.id : hit.slug,
      slug: hit.slug,
      name: hit.name,
      city: typeof hit.city === "string" ? hit.city : "",
      province: typeof hit.province === "string" ? hit.province : "",
      spots: Number.isFinite(spots) ? spots : 0,
      confirmedAt: typeof hit.confirmedAt === "string" ? hit.confirmedAt : "",
      distanceKm: Number.isFinite(distanceKm) ? distanceKm : 0,
      distanceLabel: typeof hit.distanceLabel === "string" ? hit.distanceLabel : "",
    }];
  });
  return {
    q,
    placeLabel: typeof bag.placeLabel === "string" ? bag.placeLabel : null,
    unknownPlace: bag.unknownPlace === true,
    hits,
  };
}

export function formatConfirmedDay(value: string, fr: boolean): string {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return "";
  try {
    return new Date(ts).toLocaleDateString(fr ? "fr-CA" : "en-CA", { dateStyle: "medium" });
  } catch {
    return "";
  }
}
