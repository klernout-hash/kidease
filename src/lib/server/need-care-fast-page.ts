import { getSql } from "@/lib/db";
import { needCareFastEnabled, ncfPointDistanceEnabled, ncfStreetEnabled } from "@/lib/features";
import { geocode, haversineKm } from "@/lib/geo";
import { listingDistancePoint } from "@/lib/ncf-point-distance";
import { PUBLIC_LISTING_SQL } from "@/lib/listing-visibility";
import {
  formatFastKm,
  needCareFastQuery,
  qualifiesNeedCareFast,
  rankNeedCareFast,
  rankNeedCareFastByAvailability,
} from "@/lib/need-care-fast";
import {
  geocodeCanadianPostal,
  geocodeStreetAddress,
  looksLikeStreetAddress,
  withinStreetRadius,
  NCF_STREET_RADIUS_KM,
  type StreetPin,
} from "@/lib/ncf-street";

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
  sort: "spots" | "distance";
  street: boolean;
  radiusKm: number | null;
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
  facility_type: string | null;
  amenities: string | null;
  show_public_address: boolean | null;
};

function iso(value: string | Date | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function emptyNeedCareFastPage(q = ""): NeedCareFastPage {
  return { q, placeLabel: null, unknownPlace: false, hits: [], sort: "distance", street: false, radiusKm: null };
}

/**
 * Real spots only. Imported from the server function handler, never from a route.
 * If the database is unreachable, return an empty list instead of the error screen.
 */
export async function loadNeedCareFastPage(
  rawQuery: string,
  now = Date.now(),
  point?: { lat?: number | null; lng?: number | null },
): Promise<NeedCareFastPage> {
  const q = needCareFastQuery(rawQuery);
  const pointOn = ncfPointDistanceEnabled();
  const lat = Number(point?.lat);
  const lng = Number(point?.lng);
  const hasDevicePoint = pointOn && Number.isFinite(lat) && Number.isFinite(lng);
  if (!q && !hasDevicePoint) return emptyNeedCareFastPage();
  try {
    const sql = await getSql();
    let street = false;
    let origin = q ? geocode(q) : null;
    if (hasDevicePoint) {
      origin = { lat, lng, label: origin?.label || q || "Your location" };
    } else if (pointOn && q) {
      const postal = await geocodeCanadianPostal(q, { cache: nominatimCache(sql) });
      if (postal) origin = postal;
    }
    if (ncfStreetEnabled() && looksLikeStreetAddress(q)) {
      const pin = await geocodeStreetAddress(q, { cache: nominatimCache(sql) });
      if (pin) {
        origin = pin;
        street = true;
      }
    }
    if (!origin) return { q, placeLabel: null, unknownPlace: true, hits: [], sort: "distance", street: false, radiusKm: null };
    const since = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const rows = await sql.query<Row>(
      `select id, slug, name, city, province, lat, lng,
              spots_infant, spots_toddler, spots_preschool, last_vacancy_updated_at,
              facility_type, amenities, show_public_address
         from daycares
        where ${PUBLIC_LISTING_SQL}
          and last_vacancy_updated_at is not null
          and last_vacancy_updated_at >= $1
          and (coalesce(spots_infant, 0) + coalesce(spots_toddler, 0) + coalesce(spots_preschool, 0)) > 0`,
      [since],
    ).catch(() => [] as Row[]);
    const list = Array.isArray(rows) ? rows : [];
    const sort = needCareFastEnabled() ? "spots" : "distance";
    const rank = sort === "spots" ? rankNeedCareFastByAvailability : rankNeedCareFast;
    const hits = rank(
      list.flatMap((row) => {
        const spots = (Number(row.spots_infant) || 0) + (Number(row.spots_toddler) || 0) + (Number(row.spots_preschool) || 0);
        const confirmedAt = iso(row.last_vacancy_updated_at);
        if (!confirmedAt || !qualifiesNeedCareFast({ spots, confirmedAt }, now)) return [];
        const rawLat = Number(row.lat);
        const rawLng = Number(row.lng);
        if (!Number.isFinite(rawLat) || !Number.isFinite(rawLng)) return [];
        if (!row.slug || !row.name) return [];
        const pin = pointOn
          ? listingDistancePoint({
              id: String(row.id),
              lat: rawLat,
              lng: rawLng,
              facilityType: row.facility_type,
              amenities: row.amenities,
              showPublicAddress: row.show_public_address === true,
            })
          : { lat: rawLat, lng: rawLng, coarse: false };
        const distanceKm = haversineKm(origin, { lat: pin.lat, lng: pin.lng });
        if (street && !withinStreetRadius(distanceKm)) return [];
        return [{
          id: String(row.id),
          slug: String(row.slug),
          name: String(row.name),
          city: row.city || "",
          province: row.province || "",
          spots,
          confirmedAt,
          distanceKm,
          distanceLabel: formatFastKm(distanceKm),
        }];
      }),
    );
    return {
      q,
      placeLabel: origin.label,
      unknownPlace: false,
      hits,
      sort,
      street,
      radiusKm: street ? NCF_STREET_RADIUS_KM : null,
    };
  } catch {
    return emptyNeedCareFastPage(q);
  }
}

function nominatimCache(sql: Awaited<ReturnType<typeof getSql>>) {
  return {
    async get(hash: string): Promise<StreetPin | null> {
      const rows = await sql<{ lat: number; lng: number; label: string }>`
        select lat, lng, label from geocode_cache where query_hash = ${hash} limit 1
      `.catch(() => [] as { lat: number; lng: number; label: string }[]);
      const row = rows[0];
      if (!row || !Number.isFinite(Number(row.lat)) || !Number.isFinite(Number(row.lng))) return null;
      return { lat: Number(row.lat), lng: Number(row.lng), label: row.label };
    },
    async set(hash: string, pin: StreetPin) {
      if (!/^[a-f0-9]{64}$/.test(hash)) return;
      await sql`
        insert into geocode_cache (query_hash, lat, lng, label, source)
        values (${hash}, ${pin.lat}, ${pin.lng}, ${pin.label}, ${"nominatim"})
        on conflict (query_hash) do update set lat = excluded.lat, lng = excluded.lng, label = excluded.label
      `.catch(() => undefined);
    },
  };
}
