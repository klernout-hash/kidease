import { isShippedLocale, type ShippedLocale } from "./languages.ts";
import {
  englishPath,
  frenchPath,
  isPairedPath,
  normalizePathname,
  pathLocale,
} from "./locale-path.ts";

/**
 * Provinces whose first visit defaults to French.
 * New Brunswick is bilingual. Add "NB" to turn that default on. It stays off.
 */
export const GEO_FRENCH_REGIONS = ["QC"] as const;

export const LOCALE_COOKIE = "kidease-locale";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
/** Set when a manual choice could not be saved to the profile before navigation. */
export const LOCALE_SYNC_KEY = "kidease-locale-sync";

const REGION_ALIASES: Record<string, string> = {
  QC: "QC",
  QUEBEC: "QC",
  "QUÉBEC": "QC",
  NB: "NB",
  "NEW BRUNSWICK": "NB",
  "NOUVEAU-BRUNSWICK": "NB",
  "NOUVEAU BRUNSWICK": "NB",
};

const CRAWLER =
  /googlebot|adsbot-google|mediapartners-google|google-inspectiontool|storebot-google|googleother|bingbot|slurp|duckduckbot|baiduspider|yandexbot|sogou|exabot|facebot|facebookexternalhit|ia_archiver|applebot|semrushbot|ahrefsbot|mj12bot|dotbot|petalbot|bytespider|gptbot|chatgpt-user|claudebot|perplexitybot|amazonbot|linkedinbot|twitterbot|slackbot|whatsapp|telegrambot|discordbot|embedly|pinterestbot|redditbot/i;

export type LocaleDecisionSource = "profile" | "cookie" | "geo" | "default";

export type VisitorLocaleInput = {
  country?: string | null;
  region?: string | null;
  cookie?: string | null;
  profileLocale?: string | null;
  profileChosen?: boolean;
  /** When the signed-in preference could not be read, do not guess from location. */
  profileUnreadable?: boolean;
  /**
   * Accepted so callers can prove the browser language is ignored.
   * The decision never reads this value.
   */
  acceptLanguage?: string | null;
  frenchRegions?: readonly string[];
};

export type VisitorLocaleDecision = {
  locale: ShippedLocale;
  explicit: boolean;
  source: LocaleDecisionSource;
  /** Location must not choose when a saved preference could not be loaded. */
  suppressGeo: boolean;
};

export type VisitorLocaleHint = VisitorLocaleDecision & { redirectTo: string | null };

export function emptyVisitorLocale(): VisitorLocaleHint {
  return { locale: "en", explicit: false, source: "default", suppressGeo: false, redirectTo: null };
}

export type LocaleRedirectInput = VisitorLocaleInput & {
  method?: string | null;
  pathname: string;
  search?: string | null;
  accept?: string | null;
  secFetchDest?: string | null;
  userAgent?: string | null;
};

export function normalizeGeoRegion(region?: string | null): string {
  let raw = (region || "").trim().toUpperCase();
  if (!raw) return "";
  if (raw.includes("-")) raw = raw.split("-").pop() || raw;
  return REGION_ALIASES[raw] || raw;
}

/** Quebec (and any region listed in `regions`) defaults to French. Everyone else gets English. */
export function localeFromGeo(
  country?: string | null,
  region?: string | null,
  regions: readonly string[] = GEO_FRENCH_REGIONS,
): "en" | "fr" {
  const code = (country || "").trim().toUpperCase();
  if (code !== "CA") return "en";
  const province = normalizeGeoRegion(region);
  return regions.includes(province) ? "fr" : "en";
}

export function isSearchCrawler(userAgent?: string | null): boolean {
  return CRAWLER.test(userAgent || "");
}

export function isLocaleDocumentRequest(input: {
  method?: string | null;
  pathname: string;
  accept?: string | null;
  secFetchDest?: string | null;
}): boolean {
  const method = (input.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") return false;
  const path = normalizePathname(input.pathname);
  if (
    path.startsWith("/api/") ||
    path === "/api" ||
    path.startsWith("/_serverFn") ||
    path.startsWith("/assets/") ||
    path.startsWith("/fonts/") ||
    path.startsWith("/icons/")
  ) {
    return false;
  }
  if (/\.[a-z0-9]{2,8}$/i.test(path)) return false;
  const dest = (input.secFetchDest || "").trim().toLowerCase();
  if (dest) return dest === "document";
  const accept = (input.accept || "").toLowerCase();
  if (!accept) return true;
  return accept.includes("text/html") || accept.includes("*/*");
}

/**
 * Saved profile, then this browser's cookie, then location.
 * The browser's language list is not a factor.
 */
export function decideVisitorLocale(input: VisitorLocaleInput = {}): VisitorLocaleDecision {
  const regions = input.frenchRegions ?? GEO_FRENCH_REGIONS;
  if (input.profileChosen && isShippedLocale(input.profileLocale)) {
    return { locale: input.profileLocale, explicit: true, source: "profile", suppressGeo: false };
  }
  if (isShippedLocale(input.cookie)) {
    return { locale: input.cookie, explicit: true, source: "cookie", suppressGeo: false };
  }
  if (input.profileUnreadable) {
    return { locale: "en", explicit: false, source: "default", suppressGeo: true };
  }
  const geo = localeFromGeo(input.country, input.region, regions);
  if (geo === "fr") return { locale: "fr", explicit: false, source: "geo", suppressGeo: false };
  return { locale: "en", explicit: false, source: "default", suppressGeo: false };
}

function attachSearch(path: string, search?: string | null): string {
  const raw = (search || "").trim();
  if (!raw || raw === "?" || raw === "#") return path;
  if (raw.startsWith("?") || raw.startsWith("#")) return `${path}${raw}`;
  return `${path}?${raw}`;
}

/**
 * Where a document request should go, or null to serve this URL.
 * Location never pulls a crawler, and never pulls a visitor off an explicit French URL
 * unless they already saved a choice. One hop: the destination matches the decision.
 */
export function localeRedirectTarget(input: LocaleRedirectInput): string | null {
  if (!isLocaleDocumentRequest(input)) return null;
  if (isSearchCrawler(input.userAgent)) return null;
  const decision = decideVisitorLocale(input);
  if (decision.suppressGeo) return null;
  if (decision.locale !== "en" && decision.locale !== "fr") return null;

  const pathname = normalizePathname(input.pathname);
  if (!isPairedPath(pathname)) return null;

  const current = pathLocale(pathname);
  const desired = decision.locale;
  if (!decision.explicit) {
    if (current === "fr") return null;
    if (desired !== "fr") return null;
  }
  if (current === desired) return null;

  const next = desired === "fr" ? frenchPath(pathname) : englishPath(pathname);
  if (normalizePathname(next) === pathname) return null;
  const target = attachSearch(next, input.search);
  if (!target.startsWith("/") || target.startsWith("//")) return null;
  return target;
}

export function localeRedirectHeaders(target: string): Record<string, string> {
  return {
    Location: target,
    "Cache-Control": "private, no-store",
    Vary: "Cookie, x-vercel-ip-country, x-vercel-ip-country-region",
  };
}

function cookieValue(header: string | null | undefined, name: string): string | null {
  for (const part of String(header ?? "").split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq).trim() !== name) continue;
    return trimmed.slice(eq + 1).trim();
  }
  return null;
}

export function readLocaleCookie(header?: string | null): ShippedLocale | null {
  const value = cookieValue(header, LOCALE_COOKIE);
  if (!value) return null;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    decoded = value;
  }
  return isShippedLocale(decoded) ? decoded : null;
}

/** Cookie written when someone picks a language. Not HttpOnly, so the switcher can set it. */
export function localeChoiceSetCookie(locale: string, secure: boolean): string {
  const code = isShippedLocale(locale) ? locale : "en";
  const secureAttr = secure ? "; Secure" : "";
  return `${LOCALE_COOKIE}=${encodeURIComponent(code)}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax${secureAttr}`;
}

export function writeLocaleChoiceCookie(locale: string) {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:";
  document.cookie = localeChoiceSetCookie(locale, secure);
}
