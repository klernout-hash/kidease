/** City directory metadata is independent of loading the global catalogue. */
import { cityHubCityName, cityHubDefBySlug, cityHubPath, type CityHubSnapshot } from "./city-hubs.ts";
import { cityHubNotFoundHead } from "./city-hub-not-found.ts";
import { pageSeoHead } from "./page-seo.ts";
import { provinceAbbrev } from "./province-phrase.ts";
import { formatCount } from "./utils.ts";

export function cityHubHead(loaderData: CityHubSnapshot | undefined, locale: "en" | "fr" = "en") {
  if (!loaderData) return cityHubNotFoundHead();
  const def = cityHubDefBySlug(loaderData.slug);
  const cityName = def ? cityHubCityName(def, locale) : loaderData.city;
  const province = provinceAbbrev(loaderData.province, locale);
  const count = formatCount(loaderData.count, locale);
  const path = locale === "fr" ? `/fr${cityHubPath(loaderData.slug)}` : cityHubPath(loaderData.slug);
  const title =
    locale === "fr"
      ? `Garderies permises à ${cityName}, ${province} · KidEase`
      : `Licensed daycare in ${cityName}, ${province} · KidEase`;
  const description =
    locale === "fr"
      ? `Parcourez ${count} centres, prématernelles et milieux familiaux permis à ${cityName}, ${province}. Recherche gratuite sur KidEase: pas de nounous ni de gardiennes.`
      : `Browse ${count} licensed centres, nurseries, and homes in ${cityName}, ${province}. Free to search on KidEase: no nannies or sitters.`;
  return pageSeoHead({ title, description, path });
}
