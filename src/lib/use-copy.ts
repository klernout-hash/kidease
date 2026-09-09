import { useRouterState } from "@tanstack/react-router";
import { tx, type CopyKey } from "./copy";
import { pathLocale } from "./locale-path";
import { useAppStore } from "./store";

/**
 * FR document URLs (`/fr`, `/fr/get-app`, …) use French chrome on the first
 * paint. Zustand still drives language on unprefixed routes (Explore, desks).
 */
export function useCopy() {
  const storeLocale = useAppStore((s) => s.locale);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const locale = pathLocale(pathname) === "fr" ? "fr" : storeLocale;
  return {
    locale,
    t: (key: CopyKey) => tx(locale, key),
  };
}
