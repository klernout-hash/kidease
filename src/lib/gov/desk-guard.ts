import { redirect } from "@tanstack/react-router";
import { getGovSession } from "@/lib/server/gov-portal";
import { govPath } from "@/lib/gov/copy";
import type { GovLocale } from "@/lib/gov/aggregate";
import { govPortalFooterEnabled } from "@/lib/features";

/** Home while FEATURE_GOV_PORTAL is off. The desk is not a public page. */
function govClosedHome(locale: GovLocale): string {
  return locale === "fr" ? "/fr" : "/";
}

export async function guardGovDesk(locale: GovLocale, nativeShell: boolean) {
  if (!govPortalFooterEnabled()) throw redirect({ href: `${govPath(locale, "login")}?closed=1` });
  if (nativeShell) return { nativeOnly: true as const, closed: false as const };
  const session = await getGovSession();
  if (!session.ok) throw redirect({ href: govPath(locale, "login") });
  return { nativeOnly: false as const, closed: false as const };
}

export async function guardGovLogin(locale: GovLocale, nativeShell: boolean) {
  if (!govPortalFooterEnabled()) return { closed: true as const };
  if (nativeShell) return { closed: false as const };
  const session = await getGovSession();
  if (session.ok) throw redirect({ href: govPath(locale) });
  return { closed: false as const };
}

/** Public website link on the closed desk. Not an automatic redirect. */
export function govPublicSite(locale: GovLocale) {
  return govClosedHome(locale);
}

export function govRobotsHead(title: string) {
  return {
    meta: [
      { title },
      { name: "robots", content: "noindex, nofollow" },
    ],
  };
}

export function govRobotsHeaders() {
  return { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "private, no-store" };
}
