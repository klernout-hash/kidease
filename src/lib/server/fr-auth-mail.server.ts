import { frAuthQcEnabled } from "@/lib/features";
import { authMailFrench } from "@/lib/fr-auth-qc";
import { readLocaleCookie } from "@/lib/locale-geo";

/**
 * French when the flag is on and this person is in Quebec, or their saved /
 * request language is French. A saved English choice still gets French mail
 * in Quebec. No city-name guessing. Never logs the address.
 */
export async function frenchAuthMailForEmail(email: string): Promise<boolean> {
  if (!frAuthQcEnabled()) return false;
  const to = email.trim().toLowerCase();
  let headers: Headers | null = null;
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    headers = getRequest()?.headers ?? null;
  } catch {
    headers = null;
  }
  let profileLocale: string | null = null;
  let profileChosen = false;
  if (to.includes("@")) {
    try {
      const { getSql } = await import("@/lib/db");
      const sql = await getSql();
      const rows = await sql<{ locale: string | null; locale_chosen: boolean | null }>`
        select p.locale, p.locale_chosen
        from profiles p
        join "user" u on u.id = p.user_id
        where lower(u.email) = ${to}
        limit 1
      `;
      profileLocale = rows[0]?.locale ?? null;
      profileChosen = rows[0]?.locale_chosen === true;
    } catch {
      profileLocale = null;
    }
  }
  const cookie = headers ? readLocaleCookie(headers.get("cookie")) : null;
  const saved = profileChosen && profileLocale ? profileLocale : cookie || (profileLocale === "fr" ? "fr" : null);
  const explicit = Boolean((profileChosen && profileLocale) || cookie);
  return authMailFrench({
    flagOn: true,
    locale: saved,
    province: headers?.get("x-vercel-ip-country-region"),
    country: headers?.get("x-vercel-ip-country"),
    acceptLanguage: explicit ? null : headers?.get("accept-language"),
  });
}
