import { parentLoginSearch, parentSignupSearch } from "./auth/parent-login.ts";

/** Keep the page the parent was on, including the search query. */
export function saveReturnPath(pathname: string, search: string, nextPath?: string): string {
  const query = search && search !== "?" ? (search.startsWith("?") ? search : `?${search}`) : "";
  const current = pathname.startsWith("/") ? pathname : `/${pathname || ""}`;
  const listed = nextPath && (current === nextPath || current.endsWith(nextPath)) ? nextPath : current;
  const path = listed.startsWith("/") ? listed : `/${listed}`;
  return `${path}${query}`;
}

export function saveLoginTo(locale: "en" | "fr"): "/login" | "/fr/login" {
  return locale === "fr" ? "/fr/login" : "/login";
}

/** Signed-out Save is a real link, so it still opens sign-in if JavaScript does not. */
export function guestSaveHref(pathname: string, search: string, locale: "en" | "fr"): string {
  const next = saveReturnPath(pathname, search);
  const query = parentSignupSearch(next, "save");
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, String(value));
  }
  return `${saveLoginTo(locale)}?${params.toString()}`;
}

/** Parent enrol opens an account, then the parent desk. It does not open the contact form. */
export function parentEnrolLogin(locale: "en" | "fr") {
  const to = saveLoginTo(locale);
  const next = locale === "fr" ? "/fr/parent" : "/parent";
  return {
    to,
    search: { ...parentLoginSearch(next), intent: "up" as const },
  };
}

/** A claim starts as a daycare account, then returns to that claim. */
export function claimAccountSearch(next: string) {
  return {
    next,
    intent: "up" as const,
    role: "provider" as const,
    desk: "provider" as const,
  };
}

/** The centre in the URL wins when it is one of this person's listings. */
export function calendarCentreId(centreFromUrl: string | undefined, listingIds: readonly string[]): string {
  if (centreFromUrl && listingIds.includes(centreFromUrl)) return centreFromUrl;
  return listingIds[0] ?? "";
}

/** Rules when the mark is on for this account. A plain note when it is not, so the desk is never blank. */
export function topRatedPage(on: boolean): "rules" | "soon" {
  return on ? "rules" : "soon";
}
