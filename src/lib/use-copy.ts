import { useCallback } from "react";
import { useRouteContext, useRouterState } from "@tanstack/react-router";
import { tx, type CopyKey } from "./copy";
import { isShippedLocale, type ShippedLocale } from "./languages";
import { localeFromSearch } from "./locale-geo";
import { pathLocale } from "./locale-path";
import { useAppStore } from "./store";

/**
 * French document URLs (`/fr`, `/fr/get-app`, …) use French on the first paint.
 * A saved choice wins on unprefixed pages. Otherwise the root hint (Quebec
 * location, or English) is used. English and French are complete. The other
 * eight locales use full packs.
 */
export function useCopy() {
  const storeLocale = useAppStore((s) => s.locale);
  const localeLocked = useAppStore((s) => s.localeLocked);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const hinted = useRouteContext({ from: "__root__" }) as {
    visitorLocale?: { locale?: string };
  };
  const stored: ShippedLocale = isShippedLocale(storeLocale) ? storeLocale : "en";
  const fromHint = isShippedLocale(hinted.visitorLocale?.locale) ? hinted.visitorLocale.locale : null;
  const fromQuery = localeFromSearch(searchStr);
  const locale: ShippedLocale =
    fromQuery ?? (pathLocale(pathname) === "fr" ? "fr" : localeLocked ? stored : (fromHint ?? stored));
  // A new `t` every render retriggers effects that load server functions
  // (parent desk, listing) until the throttle returns 429.
  const t = useCallback((key: CopyKey) => tx(locale, key), [locale]);
  return { locale, t };
}
