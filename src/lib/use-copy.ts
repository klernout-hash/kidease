import { useRouterState } from "@tanstack/react-router";
import { tx, type CopyKey } from "./copy";
import { isShippedLocale } from "./languages";
import { pathLocale } from "./locale-path";
import { useAppStore } from "./store";

/**
 * FR document URLs (`/fr`, `/fr/get-app`, …) use French chrome on the first
 * paint. Zustand still drives language on unprefixed routes (Explore, desks).
 * Partial language packs are not shipped — they render as English.
 */
export function useCopy() {
  const storeLocale = useAppStore((s) => s.locale);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const stored = isShippedLocale(storeLocale) ? storeLocale : "en";
  const locale = pathLocale(pathname) === "fr" ? "fr" : stored;
  return {
    locale,
    t: (key: CopyKey) => tx(locale, key),
  };
}
