import { readSessionTokenFromHeader, unsignedSessionToken } from "@/lib/auth/cookies";
import { withTimeout } from "@/lib/timeout";
import {
  decideVisitorLocale,
  emptyVisitorLocale,
  isLocaleDocumentRequest,
  localeChoiceSetCookie,
  localeRedirectHeaders,
  localeRedirectTarget,
  readLocaleCookie,
  type VisitorLocaleHint,
} from "@/lib/locale-geo";

const PROFILE_LOCALE_MS = 400;

type CacheEntry = { pathname: string; search: string; promise: Promise<VisitorLocaleHint> };

const decisionByRequest = new WeakMap<Request, CacheEntry>();

function requestIsSecure(request: Request): boolean {
  const forwarded = (request.headers.get("x-forwarded-proto") || "").split(",")[0]?.trim().toLowerCase();
  if (forwarded) return forwarded === "https";
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

function chosenFlag(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

async function loadProfileLocale(token: string): Promise<{ locale: string | null; chosen: boolean } | null> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql<{ locale: string | null; locale_chosen: boolean | string | number | null }>`
    select p.locale, p.locale_chosen
    from "session" s
    join profiles p on p.user_id = s."userId"
    where s.token = ${token} and s."expiresAt" > now()
    limit 1
  `;
  const row = rows[0];
  if (!row || !chosenFlag(row.locale_chosen)) return null;
  return { locale: row.locale, chosen: true };
}

async function profileChoice(request: Request): Promise<{
  profileLocale: string | null;
  profileChosen: boolean;
  profileUnreadable: boolean;
}> {
  const token = unsignedSessionToken(readSessionTokenFromHeader(request.headers.get("cookie")));
  if (!token) return { profileLocale: null, profileChosen: false, profileUnreadable: false };
  try {
    const row = await withTimeout(loadProfileLocale(token), PROFILE_LOCALE_MS, "locale-profile");
    if (!row) return { profileLocale: null, profileChosen: false, profileUnreadable: false };
    return { profileLocale: row.locale, profileChosen: true, profileUnreadable: false };
  } catch {
    return { profileLocale: null, profileChosen: false, profileUnreadable: true };
  }
}

function pageUrl(request: Request, pathname: string, search: string): URL {
  const url = new URL(request.url);
  url.pathname = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const raw = search.trim();
  if (!raw) {
    url.search = "";
    url.hash = "";
    return url;
  }
  if (raw.startsWith("#")) {
    url.search = "";
    url.hash = raw;
    return url;
  }
  const hashAt = raw.indexOf("#");
  if (hashAt >= 0) {
    url.search = raw.slice(0, hashAt);
    url.hash = raw.slice(hashAt);
    return url;
  }
  url.search = raw.startsWith("?") ? raw : `?${raw}`;
  url.hash = "";
  return url;
}

async function computeHint(request: Request, url: URL, asDocument: boolean): Promise<VisitorLocaleHint> {
  const profile = await profileChoice(request);
  const search = `${url.search || ""}${url.hash || ""}`;
  const shared = {
    country: request.headers.get("x-vercel-ip-country"),
    region: request.headers.get("x-vercel-ip-country-region"),
    cookie: readLocaleCookie(request.headers.get("cookie")),
    profileLocale: profile.profileLocale,
    profileChosen: profile.profileChosen,
    profileUnreadable: profile.profileUnreadable,
  };
  const decision = decideVisitorLocale(shared);
  // Route loads ask about the page. The server-fn request itself is not a document.
  const redirectTo = localeRedirectTarget({
    ...shared,
    method: asDocument ? "GET" : request.method,
    pathname: url.pathname,
    search,
    accept: asDocument ? "text/html" : request.headers.get("accept"),
    secFetchDest: asDocument ? "document" : request.headers.get("sec-fetch-dest"),
    userAgent: request.headers.get("user-agent"),
  });
  return { ...decision, redirectTo };
}

export function resolveRequestLocale(
  request: Request,
  url: URL,
  asDocument = false,
): Promise<VisitorLocaleHint> {
  const search = `${url.search || ""}${url.hash || ""}`;
  const hit = decisionByRequest.get(request);
  if (hit && hit.pathname === url.pathname && hit.search === search) return hit.promise;
  const promise = computeHint(request, url, asDocument).catch(() => emptyVisitorLocale());
  decisionByRequest.set(request, { pathname: url.pathname, search, promise });
  return promise;
}

function alignProfileCookie(headers: Headers, request: Request, hint: VisitorLocaleHint) {
  if (hint.source !== "profile" || !hint.explicit) return;
  const cookie = readLocaleCookie(request.headers.get("cookie"));
  if (cookie === hint.locale) return;
  headers.append("Set-Cookie", localeChoiceSetCookie(hint.locale, requestIsSecure(request)));
}

export type LocaleDocumentDecision = {
  redirect: Response | null;
  hint: VisitorLocaleHint | null;
};

/**
 * Document requests: Quebec (and a saved French choice) get the French URL.
 * `redirect` is a temporary hop that must not be cached. `hint` is set when
 * this response should carry the saved profile language in a cookie.
 */
export async function localeDocumentDecision(request: Request): Promise<LocaleDocumentDecision> {
  const none = { redirect: null, hint: null };
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return none;
  }
  if (
    !isLocaleDocumentRequest({
      method: request.method,
      pathname: url.pathname,
      accept: request.headers.get("accept"),
      secFetchDest: request.headers.get("sec-fetch-dest"),
    })
  ) {
    return none;
  }
  let hint: VisitorLocaleHint;
  try {
    hint = await resolveRequestLocale(request, url);
  } catch {
    return none;
  }
  if (!hint.redirectTo) return { redirect: null, hint };
  const headers = new Headers(localeRedirectHeaders(hint.redirectTo));
  try {
    alignProfileCookie(headers, request, hint);
  } catch {
    /* the redirect still wins */
  }
  return { redirect: new Response(null, { status: 302, headers }), hint: null };
}

export function stampProfileLocaleCookie(request: Request, headers: Headers, hint: VisitorLocaleHint | null) {
  if (!hint) return;
  alignProfileCookie(headers, request, hint);
}

export async function readVisitorLocale(
  request: Request,
  pathname: string,
  search: string,
): Promise<VisitorLocaleHint> {
  return resolveRequestLocale(request, pageUrl(request, pathname, search), true);
}
