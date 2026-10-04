/** Language for a document title. Comes from the root visitor hint, already decided on the server. */
export function headChromeLocale(
  matches: ReadonlyArray<{ routeId: string; context?: unknown }>,
): "en" | "fr" {
  const root = matches.find((match) => match.routeId === "__root__");
  const locale = (root?.context as { visitorLocale?: { locale?: string } } | undefined)?.visitorLocale?.locale;
  return locale === "fr" ? "fr" : "en";
}
