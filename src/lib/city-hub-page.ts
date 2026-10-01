import { notFound } from "@tanstack/react-router";
import { cityHubBySlug } from "@/lib/city-hub-data";
import { cityHubCityName, cityHubDefBySlug, cityHubPath, type CityHubSnapshot } from "@/lib/city-hubs";
import { cityHubNotFoundHead } from "@/lib/city-hub-not-found";
import { pageSeoHead } from "@/lib/page-seo";
import { filterSuppressedBundleRows } from "@/lib/server/bundled-catalog";
import { liveHubCount } from "@/lib/server/city-directory";

export async function loadCityHub(city: string): Promise<CityHubSnapshot> {
  // Published Canadian hubs only. US and unknown slugs 404 — they must not
  // fall through to the Winnipeg search page. The document edge does the
  // same in scripts/request-guard.mjs so the SPA shell cannot return 200.
  const hub = cityHubBySlug(city);
  if (!hub) throw notFound();
  let count = hub.count;
  try {
    const live = await liveHubCount(hub.slug);
    if (live != null) count = live;
  } catch {
    /* Snapshot count stays if the live catalogue is unreachable. */
  }
  try {
    const listings = await filterSuppressedBundleRows({ data: hub.listings });
    return { ...hub, count, listings };
  } catch {
    return { ...hub, count };
  }
}

export function cityHubHead(loaderData: CityHubSnapshot | undefined, locale: "en" | "fr" = "en") {
  if (!loaderData) return cityHubNotFoundHead();
  const def = cityHubDefBySlug(loaderData.slug);
  const cityName = def ? cityHubCityName(def, locale) : loaderData.city;
  const path = locale === "fr" ? `/fr${cityHubPath(loaderData.slug)}` : cityHubPath(loaderData.slug);
  const title =
    locale === "fr"
      ? `Garderies permises à ${cityName}, ${loaderData.province} · KidEase`
      : `Licensed daycare in ${cityName}, ${loaderData.province} · KidEase`;
  const description =
    locale === "fr"
      ? `Parcourez ${loaderData.count} centres, nurseries et milieux familiaux permis à ${cityName}, ${loaderData.province}. Recherche gratuite sur KidEase — pas de nounous ni de gardiennes.`
      : `Browse ${loaderData.count} licensed centres, nurseries, and homes in ${cityName}, ${loaderData.province}. Free to search on KidEase — no nannies or sitters.`;
  return pageSeoHead({ title, description, path });
}
