import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { catalogByIdGet } from "@/lib/catalog";

const KEY = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "";

type PlaceHit = { placeId: string; ratingX10: number; reviewCount: number };

export type PlaceSuggestion = { placeId: string; label: string; secondary: string };
export type ResolvedPlace = { lat: number; lng: number; label: string };

const NA_COMPONENTS = "country:ca|country:us|country:mx";

function placesKey() {
  return KEY;
}

export const suggestPlaces = createServerFn({ method: "POST" })
  .validator((input: { q: string; session?: string; lat?: number; lng?: number }) => ({
    q: String(input?.q ?? "").trim().slice(0, 120),
    session: String(input?.session ?? "").slice(0, 64),
    lat: typeof input?.lat === "number" && Number.isFinite(input.lat) ? input.lat : undefined,
    lng: typeof input?.lng === "number" && Number.isFinite(input.lng) ? input.lng : undefined,
  }))
  .handler(async ({ data }): Promise<PlaceSuggestion[]> => {
    if (!placesKey() || data.q.length < 2) return [];
    const params = new URLSearchParams({
      input: data.q,
      key: placesKey(),
      types: "geocode",
      components: NA_COMPONENTS,
      language: "en",
    });
    if (data.session) params.set("sessiontoken", data.session);
    if (data.lat != null && data.lng != null) {
      params.set("location", `${data.lat},${data.lng}`);
      params.set("radius", "50000");
    }
    const res = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`);
    if (!res.ok) return [];
    const json = (await res.json()) as {
      predictions?: Array<{
        place_id?: string;
        description?: string;
        structured_formatting?: { main_text?: string; secondary_text?: string };
      }>;
    };
    return (json.predictions ?? [])
      .filter((p) => p.place_id && p.description)
      .slice(0, 6)
      .map((p) => ({
        placeId: p.place_id!,
        label: p.structured_formatting?.main_text || p.description!,
        secondary: p.structured_formatting?.secondary_text || p.description || "",
      }));
  });

export const resolvePlaceId = createServerFn({ method: "POST" })
  .validator((input: { placeId: string; session?: string }) => ({
    placeId: String(input?.placeId ?? "").slice(0, 256),
    session: String(input?.session ?? "").slice(0, 64),
  }))
  .handler(async ({ data }): Promise<ResolvedPlace | null> => {
    if (!placesKey() || !data.placeId) return null;
    const params = new URLSearchParams({
      place_id: data.placeId,
      key: placesKey(),
      fields: "geometry,formatted_address,name",
    });
    if (data.session) params.set("sessiontoken", data.session);
    const res = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params}`);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      result?: {
        name?: string;
        formatted_address?: string;
        geometry?: { location?: { lat?: number; lng?: number } };
      };
    };
    const loc = json.result?.geometry?.location;
    if (typeof loc?.lat !== "number" || typeof loc?.lng !== "number") return null;
    return {
      lat: loc.lat,
      lng: loc.lng,
      label: json.result?.formatted_address || json.result?.name || data.placeId,
    };
  });

export const geocodePlace = createServerFn({ method: "POST" })
  .validator((q: string) => String(q ?? "").trim().slice(0, 160))
  .handler(async ({ data }): Promise<ResolvedPlace | null> => {
    if (!placesKey() || !data) return null;
    const params = new URLSearchParams({
      address: data,
      key: placesKey(),
      components: NA_COMPONENTS,
    });
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      results?: Array<{
        formatted_address?: string;
        geometry?: { location?: { lat?: number; lng?: number } };
      }>;
    };
    const hit = json.results?.[0];
    const loc = hit?.geometry?.location;
    if (typeof loc?.lat !== "number" || typeof loc?.lng !== "number") return null;
    return { lat: loc.lat, lng: loc.lng, label: hit?.formatted_address || data };
  });


async function lookupPlace(name: string, address: string): Promise<PlaceHit | null> {
  if (!KEY) return null;
  const q = encodeURIComponent(`${name} ${address}`);
  const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${q}&inputtype=textquery&fields=place_id,rating,user_ratings_total&key=${KEY}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = (await res.json()) as {
    candidates?: Array<{ place_id?: string; rating?: number; user_ratings_total?: number }>;
  };
  const hit = json.candidates?.[0];
  if (!hit?.place_id) return null;
  return {
    placeId: hit.place_id,
    ratingX10: Math.round((hit.rating ?? 0) * 10),
    reviewCount: hit.user_ratings_total ?? 0,
  };
}

export const refreshGoogleRating = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const listed = await catalogByIdGet(id);
    if (!listed) return null;
    const hit = await lookupPlace(listed.name, `${listed.address}, ${listed.city} ${listed.province}`);
    if (!hit) return { ratingX10: listed.ratingX10, reviewCount: listed.reviewCount, googlePlaceId: listed.googlePlaceId };
    const sql = await getSql();
    await sql.query(
      `update daycares set google_place_id = $2, google_rating_x10 = $3, google_review_count = $4, google_synced_at = now(),
        rating_x10 = case when $3 > 0 then $3 else rating_x10 end,
        review_count = case when $4 > 0 then $4 else review_count end
       where id = $1`,
      [id, hit.placeId, hit.ratingX10, hit.reviewCount],
    ).catch(() => undefined);
    return { ...hit, googlePlaceId: hit.placeId };
  });
