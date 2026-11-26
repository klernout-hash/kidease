import { useLoaderData, useLocation, useRouteContext } from "@tanstack/react-router";
import { GovDeskPage } from "@/components/gov/gov-desk-page";
import { GovNativeNote } from "@/components/gov/gov-login";
import type { GovDeskPageData } from "@/lib/server/gov-desk";

/**
 * Screen for every /gov/<page> desk route. The routes load this one module
 * lazily, so 42 desk pages share one client chunk instead of 84.
 */
export function GovDeskRouteView() {
  const gate = useRouteContext({ strict: false }) as { nativeOnly?: boolean };
  const data = useLoaderData({ strict: false }) as GovDeskPageData | null | undefined;
  const { pathname } = useLocation();
  const locale = pathname === "/fr" || pathname.startsWith("/fr/") ? "fr" : "en";
  if (gate.nativeOnly || !data) return <GovNativeNote locale={locale} />;
  return <GovDeskPage data={data} />;
}
