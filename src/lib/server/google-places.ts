import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { catalogByIdGet } from "@/lib/catalog";

const KEY = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "";

type PlaceHit = { placeId: string; ratingX10: number; reviewCount: number };

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
