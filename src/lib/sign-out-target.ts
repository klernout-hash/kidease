/**
 * Where the app menu sends someone after Sign out (#1014 item 8).
 *
 * Government users go to the government sign-in in their language
 * (/fr/gov/login from a French desk). localePath() does not know /gov, so
 * it used to send French officers to the English /gov/login. Everyone else
 * lands on the sign-in page in their language (N-37 / N-34: never on Guest
 * Explore, which looked like the session was still half alive).
 * No app imports beyond plain helpers, so node tests load this file directly.
 */
import { govPath } from "./gov/copy.ts";
import { isFrPath } from "./locale-path.ts";

export function signOutLocale(pathname: string | null | undefined, locale: string | null | undefined): "fr" | "en" {
  return isFrPath(pathname) || locale === "fr" ? "fr" : "en";
}

export function signOutTarget(input: {
  role: string | null | undefined;
  pathname: string | null | undefined;
  locale: string | null | undefined;
}): string {
  const lang = signOutLocale(input.pathname, input.locale);
  if (input.role === "government") return govPath(lang, "login");
  return signedOutLoginPath(lang);
}

/** The sign-in page in this language. Every non-government sign-out lands here. */
export function signedOutLoginPath(lang: "fr" | "en"): "/fr/login" | "/login" {
  return lang === "fr" ? "/fr/login" : "/login";
}

/** Home link in the app header: the government desk in the right language, or localePath for others. */
export function governmentHomePath(pathname: string | null | undefined, locale: string | null | undefined): string {
  return govPath(signOutLocale(pathname, locale));
}
