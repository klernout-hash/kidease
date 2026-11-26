import type { GovLocale } from "./aggregate.ts";
import { GOV_GROUPS, govPage, type GovPageDef } from "./desk.ts";

/** Sections drawn by the province dashboard view. */
export type GovSection = "overview" | "expiries" | "analytics" | "reports" | "data";

const SECTION_TITLES: Record<GovSection, { en: string; fr: string; leaf: string }> = {
  overview: { en: "Overview", fr: "Aperçu", leaf: "" },
  expiries: { en: "Expiries and alerts", fr: "Échéances et alertes", leaf: "expiries" },
  analytics: { en: "Analytics", fr: "Analyses", leaf: "analytics" },
  reports: { en: "Reports", fr: "Rapports", leaf: "reports" },
  data: { en: "Data and exports", fr: "Données et exportations", leaf: "data" },
};

/** Five top-level menu items. Each group opens its first page; the group row lists the rest. */
export const GOV_MENU: Array<{ id: GovPageDef["group"]; en: string; fr: string; leaf: string }> = GOV_GROUPS.map((group) => ({
  id: group.id,
  en: group.en,
  fr: group.fr,
  leaf: group.first,
}));

export function govMenuLabel(id: GovSection, locale: GovLocale): string {
  const item = SECTION_TITLES[id] ?? SECTION_TITLES.overview;
  return locale === "fr" ? item.fr : item.en;
}

/** Path of a dashboard section, or of a top-level group (its first page). */
export function govMenuHref(locale: GovLocale, id: GovSection | GovPageDef["group"]): string {
  const root = locale === "fr" ? "/fr/gov" : "/gov";
  const section = (SECTION_TITLES as Record<string, { leaf: string }>)[id];
  const leaf = section ? section.leaf : (GOV_GROUPS.find((group) => group.id === id)?.first ?? "");
  return leaf ? `${root}/${leaf}` : root;
}

/** The top-level group a page or dashboard section belongs to. */
export function govGroupOf(leafOrSection: string): GovPageDef["group"] {
  if (!leafOrSection || leafOrSection === "overview") return "overview";
  return govPage(leafOrSection)?.group ?? "overview";
}
