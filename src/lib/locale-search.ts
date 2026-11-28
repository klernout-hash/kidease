/**
 * `?lang=fr` on an unprefixed URL (/inbox?lang=fr, /parent?lang=fr) is how a
 * French visitor without a /fr path keeps French. Router links used to drop
 * it, so opening a thread or a sidebar item switched to English (B03a, B04).
 * Root search middleware: keep the current `lang` unless the link sets its own.
 */
export type LangSearch = { lang?: unknown } & Record<string, unknown>;

export function keepLangParam(current: LangSearch | undefined, next: LangSearch): LangSearch {
  const lang = current?.lang;
  if (lang !== "fr" && lang !== "en") return next;
  if (Object.prototype.hasOwnProperty.call(next, "lang")) return next;
  return { ...next, lang };
}

/** Parent pages that only have an English route file. /fr/<path> fell into the
 * /fr/parent desk and showed parent home (B-org #40). */
const FR_PARENT_EN_ONLY = new Set([
  "child-profile",
  "complaint-updates",
  "data-request",
  "enrolment-handoff",
  "escalations",
  "notifications",
  "spot-offers",
  "subsidy",
  "withdrawal",
]);

/** `/fr/parent/subsidy?x=1` -> `/parent/subsidy?x=1&lang=fr`; null when the path has its own FR route. */
export function frParentAliasHref(pathname: string, searchStr = ""): string | null {
  const m = /^\/fr\/parent\/([a-z-]+)\/?$/.exec(pathname);
  if (!m || !FR_PARENT_EN_ONLY.has(m[1])) return null;
  const params = new URLSearchParams(searchStr.startsWith("?") ? searchStr.slice(1) : searchStr);
  params.set("lang", "fr");
  return `/parent/${m[1]}?${params.toString()}`;
}
