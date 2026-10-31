import { redirect } from "@tanstack/react-router";
import { getGovSession } from "@/lib/server/gov-portal";
import { govPath } from "@/lib/gov/copy";
import type { GovLocale } from "@/lib/gov/aggregate";

export async function guardGovDesk(locale: GovLocale, nativeShell: boolean) {
  if (nativeShell) return { nativeOnly: true as const };
  const session = await getGovSession();
  if (!session.ok) throw redirect({ href: govPath(locale, "login") });
  return { nativeOnly: false as const };
}

export async function guardGovLogin(locale: GovLocale, nativeShell: boolean) {
  if (nativeShell) return;
  const session = await getGovSession();
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
