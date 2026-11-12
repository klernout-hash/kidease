import type { GovLocale } from "./aggregate.ts";

export type GovSection = "overview" | "expiries" | "analytics" | "reports" | "data";

export const GOV_MENU: Array<{ id: GovSection; en: string; fr: string; leaf: string }> = [
  { id: "overview", en: "Overview", fr: "Aperçu", leaf: "" },
  { id: "expiries", en: "Expiries and alerts", fr: "Échéances et alertes", leaf: "expiries" },
  { id: "analytics", en: "Analytics", fr: "Analyses", leaf: "analytics" },
  { id: "reports", en: "Reports", fr: "Rapports", leaf: "reports" },
  { id: "data", en: "Data and exports", fr: "Données et exportations", leaf: "data" },
];

export function govMenuLabel(id: GovSection, locale: GovLocale): string {
  const item = GOV_MENU.find((row) => row.id === id) ?? GOV_MENU[0];
  return locale === "fr" ? item.fr : item.en;
}

export function govMenuHref(locale: GovLocale, id: GovSection): string {
  const item = GOV_MENU.find((row) => row.id === id) ?? GOV_MENU[0];
  const root = locale === "fr" ? "/fr/gov" : "/gov";
  return item.leaf ? `${root}/${item.leaf}` : root;
}
