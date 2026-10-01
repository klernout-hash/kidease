import type { CopyKey } from "./copy";
import type { Locale } from "./types";

export type ExtraLocale = Exclude<Locale, "en" | "fr">;
type Pack = Partial<Record<CopyKey, string>>;

/** Languages besides English and French. Each pack loads only after it is chosen. */
export const EXTRA_LOCALES = ["zh", "yue", "pa", "es", "ar", "tl", "it", "de"] as const;

const cache: Partial<Record<ExtraLocale, Pack>> = {};
const inflight = new Map<ExtraLocale, Promise<Pack>>();
let activateTicket = 0;

const loaders: Record<ExtraLocale, () => Promise<Pack>> = {
  zh: () => import("./i18n/zh.json", { with: { type: "json" } }).then(asPack),
  yue: () => import("./i18n/yue.json", { with: { type: "json" } }).then(asPack),
  pa: () => import("./i18n/pa.json", { with: { type: "json" } }).then(asPack),
  es: () => import("./i18n/es.json", { with: { type: "json" } }).then(asPack),
  ar: () => import("./i18n/ar.json", { with: { type: "json" } }).then(asPack),
  tl: () => import("./i18n/tl.json", { with: { type: "json" } }).then(asPack),
  it: () => import("./i18n/it.json", { with: { type: "json" } }).then(asPack),
  de: () => import("./i18n/de.json", { with: { type: "json" } }).then(asPack),
};

function asPack(mod: { default?: Pack } | Pack): Pack {
  if (mod && typeof mod === "object" && "default" in mod && mod.default && typeof mod.default === "object") {
    return mod.default;
  }
  return mod as Pack;
}

export function isExtraLocale(code: string | null | undefined): code is ExtraLocale {
  return (EXTRA_LOCALES as readonly string[]).includes(code ?? "");
}

/** Already-loaded pack. Empty until `loadExtraCopy` finishes for that language. */
export function extraPack(locale: ExtraLocale): Pack | undefined {
  return cache[locale];
}

export function loadExtraCopy(locale: ExtraLocale): Promise<Pack> {
  const hit = cache[locale];
  if (hit) return Promise.resolve(hit);
  let pending = inflight.get(locale);
  if (!pending) {
    pending = loaders[locale]().then((pack) => {
      cache[locale] = pack;
      inflight.delete(locale);
      return pack;
    });
    inflight.set(locale, pending);
  }
  return pending;
}

/**
 * English and French resolve immediately. An extra language resolves only after
 * its pack is in memory, and only if the caller is still the latest request.
 */
export function activateLocale(locale: Locale | string): Promise<boolean> {
  const mine = ++activateTicket;
  const pending = isExtraLocale(locale) ? loadExtraCopy(locale).then(() => undefined) : Promise.resolve();
  return pending.then(() => mine === activateTicket);
}
