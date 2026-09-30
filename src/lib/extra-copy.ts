import type { CopyKey } from "./copy";
import type { Locale } from "./types";
import ar from "./i18n/ar.json" with { type: "json" };
import de from "./i18n/de.json" with { type: "json" };
import es from "./i18n/es.json" with { type: "json" };
import it from "./i18n/it.json" with { type: "json" };
import pa from "./i18n/pa.json" with { type: "json" };
import tl from "./i18n/tl.json" with { type: "json" };
import yue from "./i18n/yue.json" with { type: "json" };
import zh from "./i18n/zh.json" with { type: "json" };

type Pack = Partial<Record<CopyKey, string>>;

/** Full chrome for the eight languages besides English and French. */
export const extraCopy: Record<Exclude<Locale, "en" | "fr">, Pack> = {
  zh,
  yue,
  pa,
  es,
  ar,
  tl,
  it,
  de,
};
