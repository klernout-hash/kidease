import { useEffect } from "react";
import { useRouteContext } from "@tanstack/react-router";
import { readLocaleCookie } from "@/lib/locale-geo";
import { isFrPath, localeSwitchPath } from "@/lib/locale-path";
import { parseLanguageList } from "@/lib/fr-ca";

/**
 * Device language fallback when the server did not see a language list.
 * A saved cookie wins. This does not sign anyone out.
 */
export function FrCaDeviceBoot() {
  const frCa = useRouteContext({ from: "__root__" }) as { frCa?: boolean };
  useEffect(() => {
    if (frCa.frCa !== true) return;
    if (typeof navigator === "undefined" || typeof window === "undefined") return;
    if (readLocaleCookie(document.cookie)) return;
    const prefer = parseLanguageList(navigator.language || "");
    if (prefer !== "fr") return;
    if (isFrPath(window.location.pathname)) return;
    const dest = localeSwitchPath(window.location.pathname, "fr");
    if (!dest || dest === window.location.pathname) return;
    window.location.replace(dest);
  }, [frCa.frCa]);
  return null;
}

export function useFrCaPack(): boolean {
  const ctx = useRouteContext({ from: "__root__" }) as { frCa?: boolean };
  return ctx.frCa === true;
}
