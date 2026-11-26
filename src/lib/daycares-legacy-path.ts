import { titleCaseCitySlug } from "./explore-search.ts";
import { geocode } from "./geo.ts";
import { cityHubDefBySlug, cityHubPath } from "./city-hubs.ts";

/**
 * Old `/daycares/:city` links (ads, shares, guesses). The city page lives at
 * `/daycare/city/:slug`; a city without a hub page goes to search for that city.
 */
export function legacyDaycaresCityTarget(rawCity: string, locale: "en" | "fr") {
  const slug = String(rawCity || "").trim().toLowerCase();
  const prefix = locale === "fr" ? "/fr" : "";
  const hub = slug ? cityHubDefBySlug(slug) : null;
  if (hub) return { href: `${prefix}${cityHubPath(hub.slug)}`, slug: hub.slug, hub: true as const };
  const label = titleCaseCitySlug(slug);
  const place = label ? geocode(label)?.label || label : "";
  return { href: `${prefix}/search`, q: place || undefined, hub: false as const };
}
