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
