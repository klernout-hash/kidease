import { getSql } from "@/lib/db";
import { geocode, haversineKm } from "@/lib/geo";
import { PUBLIC_LISTING_SQL } from "@/lib/listing-visibility";
import { formatFastKm, qualifiesNeedCareFast, rankNeedCareFast } from "@/lib/need-care-fast";

export type NeedCareFastHit = {
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

export type NeedCareFastPage = {
  q: string;
  placeLabel: string | null;
  unknownPlace: boolean;
  hits: NeedCareFastHit[];
};

type Row = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  province: string | null;
  lat: number | null;
  lng: number | null;
  spots_infant: number | null;
  spots_toddler: number | null;
  spots_preschool: number | null;
  last_vacancy_updated_at: string | Date | null;
};

function iso(value: string | Date | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export async function loadNeedCareFast(rawQuery: string, now = Date.now()): Promise<NeedCareFastPage> {
  const q = String(rawQuery || "").trim().slice(0, 80);
  if (!q) return { q: "", placeLabel: null, unknownPlace: false, hits: [] };
  const origin = geocode(q);
  if (!origin) return { q, placeLabel: null, unknownPlace: true, hits: [] };
  const since = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const sql = await getSql();
  const rows = await sql.query<Row>(
    `select id, slug, name, city, province, lat, lng,
            spots_infant, spots_toddler, spots_preschool, last_vacancy_updated_at
       from daycares
      where ${PUBLIC_LISTING_SQL}
        and last_vacancy_updated_at is not null
        and last_vacancy_updated_at >= $1
        and (coalesce(spots_infant, 0) + coalesce(spots_toddler, 0) + coalesce(spots_preschool, 0)) > 0`,
    [since],
  ).catch(() => [] as Row[]);
  const hits = rankNeedCareFast(
    rows.flatMap((row) => {
      const spots = (Number(row.spots_infant) || 0) + (Number(row.spots_toddler) || 0) + (Number(row.spots_preschool) || 0);
      const confirmedAt = iso(row.last_vacancy_updated_at);
      if (!confirmedAt || !qualifiesNeedCareFast({ spots, confirmedAt }, now)) return [];
      const lat = Number(row.lat);
      const lng = Number(row.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
      const distanceKm = haversineKm(origin, { lat, lng });
      return [{
        id: row.id,
        slug: row.slug,
        name: row.name,
        city: row.city || "",
        province: row.province || "",
        spots,
        confirmedAt,
        distanceKm,
        distanceLabel: formatFastKm(distanceKm),
      }];
    }),
  );
  return { q, placeLabel: origin.label, unknownPlace: false, hits };
}
