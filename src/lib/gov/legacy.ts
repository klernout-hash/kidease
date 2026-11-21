/** Bookmarks such as /gov/map stay on the government desk. */
export function govLegacyHref(locale: "en" | "fr", splat: string): string {
  const root = locale === "fr" ? "/fr/gov" : "/gov";
  const leaf = splat.split("/")[0] || "";
  if (leaf === "map") return `${root}#gov-map-title`;
  if (leaf === "centres") return `${root}#gov-centres`;
  if (leaf === "vacancies") return `${root}#gov-wait-title`;
  if (leaf === "overview" || leaf === "dashboard") return root;
  if (leaf === "settings") return `${root}/data`;
  return root;
}
