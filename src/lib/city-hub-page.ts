import { notFound } from "@tanstack/react-router";
import { CITY_HUB_LISTING_CAP, type CityHubSnapshot } from "@/lib/city-hubs";
import { filterSuppressedBundleRows } from "@/lib/server/bundled-catalog";
import { listingsForCityHub, liveHubCount } from "@/lib/server/city-directory";

export async function loadCityHub(city: string): Promise<CityHubSnapshot> {
  // Published Canadian hubs only. US and unknown slugs 404: they must not
  // fall through to the Winnipeg search page. The document edge does the
  // same in scripts/request-guard.mjs so the SPA shell cannot return 200.
  const [{ cityHubBySlug }, { isPublicListing }] = await Promise.all([
    import("@/lib/city-hub-data"),
    import("@/lib/listing-visibility"),
  ]);
  const hub = cityHubBySlug(city);
  if (!hub) throw notFound();
  const [live, liveListings] = await Promise.all([
    liveHubCount(hub.slug).catch(() => null),
    listingsForCityHub(hub.slug).catch(() => []),
  ]);
  const count = live != null ? live : hub.count;
  try {
    if (liveListings.length > 0) {
      return {
        ...hub,
        count,
        listings: liveListings.slice(0, CITY_HUB_LISTING_CAP).map((row) => ({
          slug: row.slug,
          name: row.name,
        })),
      };
    }
    const listings = (await filterSuppressedBundleRows({ data: hub.listings })).filter((row) =>
      isPublicListing(row),
    );
    return { ...hub, count, listings };
  } catch {
    return {
      ...hub,
      count,
      listings: hub.listings.filter((row) => isPublicListing(row)),
    };
  }
}

export { cityHubHead } from "./city-hub-head.ts";
