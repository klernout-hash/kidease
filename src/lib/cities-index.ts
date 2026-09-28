/**
 * Public /cities index. Every Canadian province and territory, with the
 * city hub pages that already exist. No invented cities, no US states.
 */

import { CITY_HUB_DEFS, cityHubCityName, cityHubPath } from "./city-hubs.ts";
import { PROVINCES } from "./geo.ts";

export type CitiesIndexCity = {
  slug: string;
  label: string;
  path: string;
};

export type CitiesIndexGroup = {
  code: string;
  name: string;
  cities: CitiesIndexCity[];
};

export function citiesIndexGroups(locale = "en"): CitiesIndexGroup[] {
  return PROVINCES.map((province) => ({
    code: province.code,
    name: locale === "fr" ? province.nameFr : province.name,
    cities: CITY_HUB_DEFS.filter((hub) => hub.province === province.code).map((hub) => ({
      slug: hub.slug,
      label: cityHubCityName(hub, locale),
      path: cityHubPath(hub.slug),
    })),
  }));
}
