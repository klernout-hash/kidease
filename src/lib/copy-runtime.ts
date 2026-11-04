import type { Locale } from "./types";
import { extraPack, isExtraLocale } from "./extra-copy.ts";
import { frenchTypography } from "./french-type.ts";
import { en, type CopyKey } from "./copy-en.ts";

type Pack = Record<CopyKey, string>;

let french: Pack | null = null;
let loading: Promise<void> | null = null;

export type { CopyKey };

/** Tests and the server install French up front. The website loads it only for /fr. */
export function installFrenchCopy(pack: Pack) {
  french = pack;
}

export function frenchCopyReady(): boolean {
  return french !== null;
}

/** Separate chunk. English pages never import it. */
export function ensureFrenchCopy(): Promise<void> {
  if (french) return Promise.resolve();
  if (!loading) {
    loading = import("./copy-fr.ts").then((mod) => {
      french = mod.fr as Pack;
    });
  }
  return loading;
}

export function tx(locale: Locale, key: CopyKey): string {
  const raw =
    locale === "fr"
      ? (french ?? en)[key]
      : locale === "en" || !isExtraLocale(locale)
        ? en[key]
        : (extraPack(locale)?.[key] ?? en[key]);
  return locale === "fr" ? frenchTypography(raw) : raw;
}
