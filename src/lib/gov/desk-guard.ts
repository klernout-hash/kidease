import { redirect } from "@tanstack/react-router";
import { getGovSession } from "@/lib/server/gov-portal";
import { govPath } from "@/lib/gov/copy";
import type { GovLocale } from "@/lib/gov/aggregate";
import { govPortalFooterEnabled } from "@/lib/features";

/** Home while FEATURE_GOV_PORTAL is off. The desk is not a public page. */
function govClosedHome(locale: GovLocale): string {
  return locale === "fr" ? "/fr" : "/";
}

function portalClosed(session: { ok: boolean; closed?: boolean }): boolean {
  return session.ok === false && session.closed === true;
}

export async function guardGovDesk(locale: GovLocale, nativeShell: boolean) {
  if (nativeShell) return { nativeOnly: true as const };
  // The browser bundle defaults this flag off. A filter change must not send
  // an officer home. The server session is the source of truth.
  if (typeof window === "undefined" && !govPortalFooterEnabled()) throw redirect({ href: govClosedHome(locale) });
  const session = await getGovSession();
  if (!session.ok) {
    if (portalClosed(session)) throw redirect({ href: govClosedHome(locale) });
    throw redirect({ href: govPath(locale, "login") });
  }
  return { nativeOnly: false as const };
}

export async function guardGovLogin(locale: GovLocale, nativeShell: boolean) {
  if (nativeShell) return;
  if (typeof window === "undefined" && !govPortalFooterEnabled()) throw redirect({ href: govClosedHome(locale) });
  const session = await getGovSession();
  if (portalClosed(session)) throw redirect({ href: govClosedHome(locale) });
  if (session.ok) throw redirect({ href: govPath(locale) });
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
