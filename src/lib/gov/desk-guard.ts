import { redirect } from "@tanstack/react-router";
import { getGovSession } from "@/lib/server/gov-portal";
import { govPath } from "@/lib/gov/copy";
import type { GovLocale } from "@/lib/gov/aggregate";
import { govPortalFooterEnabled } from "@/lib/features";
import { govVerifyPath } from "@/lib/gov/second-factor";
import { govDeskDecision, type GovSessionProbe } from "@/lib/gov/access";

/** Home while FEATURE_GOV_PORTAL is off. The desk is not a public page. */
function govClosedHome(locale: GovLocale): string {
  return locale === "fr" ? "/fr" : "/";
}

function portalClosed(session: { ok: boolean; closed?: boolean }): boolean {
  return session.ok === false && session.closed === true;
}

export async function guardGovDesk(locale: GovLocale, nativeShell: boolean) {
  // The browser bundle defaults this flag off. A filter change must not send
  // an officer home. The server session is the source of truth.
  const portalOpen = typeof window !== "undefined" || govPortalFooterEnabled();
  if (!nativeShell && !portalOpen) throw redirect({ href: govClosedHome(locale) });
  let session: GovSessionProbe | null = null;
  try {
    session = await getGovSession();
  } catch (err) {
    // The app note needs no session. On the website, a failed check is not a pass.
    if (!nativeShell) throw err;
  }
  const decision = govDeskDecision({ nativeShell, portalOpen, session });
  // N-27: loaders skip desk data whenever nativeOnly is set.
  if (decision.kind === "native-note") return { nativeOnly: true as const };
  if (decision.kind === "unavailable") return { nativeOnly: true as const, govUnavailable: true as const };
  if (decision.kind === "desk") return { nativeOnly: false as const };
  if (decision.to === "home") throw redirect({ href: govClosedHome(locale) });
  if (decision.to === "verify") throw redirect({ href: govVerifyPath(locale, govPath(locale)) });
  throw redirect({ href: govPath(locale, "login") });
}

export async function guardGovLogin(locale: GovLocale, nativeShell: boolean) {
  if (nativeShell) return;
  if (typeof window === "undefined" && !govPortalFooterEnabled()) throw redirect({ href: govClosedHome(locale) });
  const session = await getGovSession();
  if (portalClosed(session)) throw redirect({ href: govClosedHome(locale) });
  if (!session.ok && session.needSecondFactor) throw redirect({ href: govVerifyPath(locale, govPath(locale)) });
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
