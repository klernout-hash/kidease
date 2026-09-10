/**
 * Official-languages URL scheme (Canada).
 *
 * English stays unprefixed (`/privacy`). French uses `/fr` + the same path
 * (`/fr/privacy`). The Zustand locale store and `copy.ts` still drive UI
 * chrome — these helpers only map the public marketing / legal surfaces that
 * need a real HTTP URL for hreflang and the sitemap.
 *
 * Catalogue listing bodies stay English for v1 (user-generated / registry
 * text). Desks and /admin stay unprefixed. `/login` has a `/fr/login`
 * counterpart so the URL is not a 404; other auth desks stay English.
 */

export const DEFAULT_LOCALE = "en" as const;
export const FR_PREFIX = "/fr";

/** Public pages that have a shipped French URL counterpart. */
export const LOCALE_PAIRED_PATHS = [
  "/",
  "/search",
  "/explore",
  "/help",
  "/contact",
  "/privacy",
  "/terms",
  "/cookies",
  "/about",
  "/faq",
  "/how-it-works",
  "/get-app",
  "/benefits",
  "/login",
] as const;

export type LocalePairedPath = (typeof LOCALE_PAIRED_PATHS)[number];

/** Redirect-only pairs — exist so `/fr/explore` is not a 404, omitted from sitemap. */
export const LOCALE_REDIRECT_PATHS = ["/explore", "/how-it-works"] as const;

const PAIRED = new Set<string>(LOCALE_PAIRED_PATHS);
const REDIRECT = new Set<string>(LOCALE_REDIRECT_PATHS);

export function normalizePathname(pathname: string | null | undefined): string {
  const raw = String(pathname ?? "/").split("?")[0] || "/";
  if (raw.length > 1 && raw.endsWith("/")) return raw.slice(0, -1);
  return raw || "/";
}

export function isFrPath(pathname: string | null | undefined): boolean {
  const path = normalizePathname(pathname);
  return path === FR_PREFIX || path.startsWith(`${FR_PREFIX}/`);
}

export function stripLocalePrefix(pathname: string | null | undefined): string {
  const path = normalizePathname(pathname);
  if (path === FR_PREFIX) return "/";
  if (path.startsWith(`${FR_PREFIX}/`)) {
    const rest = path.slice(FR_PREFIX.length);
    return rest.startsWith("/") ? rest : `/${rest}`;
  }
  return path;
}

export function pathLocale(pathname: string | null | undefined): "en" | "fr" {
  return isFrPath(pathname) ? "fr" : "en";
}

export function documentLangFromPath(pathname: string | null | undefined): string {
  return isFrPath(pathname) ? "fr-CA" : "en";
}

export function isPairedPath(pathname: string | null | undefined): boolean {
  return PAIRED.has(stripLocalePrefix(pathname));
}

export function frenchPath(enPath: string): string {
  const bare = stripLocalePrefix(enPath);
  return bare === "/" ? FR_PREFIX : `${FR_PREFIX}${bare}`;
}

export function englishPath(pathname: string): string {
  return stripLocalePrefix(pathname);
}

/** Prefix a paired English path when the UI locale is French. `/search` ↔ `/fr/search`. */
export function localePath(enPath: string, locale: string): string {
  const bare = enPath.startsWith("/") ? enPath : `/${enPath}`;
  if (bare === "/explore") return locale === "fr" ? frenchPath("/search") : "/search";
  if (locale === "fr" && PAIRED.has(bare)) return frenchPath(bare);
  return bare;
}

export function sitemapFrenchPaths(enPaths: readonly string[] = LOCALE_PAIRED_PATHS): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const path of enPaths) {
    const bare = stripLocalePrefix(path);
    if (!PAIRED.has(bare) || REDIRECT.has(bare)) continue;
    const fr = frenchPath(bare);
    if (seen.has(fr)) continue;
    seen.add(fr);
    out.push(fr);
  }
  return out;
}

export const SITEMAP_FR_PATHS = sitemapFrenchPaths();

const DESK_OR_AUTH_PREFIXES = [
  "/parent",
  "/provider",
  "/admin",
  "/support",
  "/account",
  "/inbox",
  "/verify-2fa",
  "/forgot-password",
  "/reset-password",
  "/menu",
  "/sign",
  "/pay",
  "/checkin",
  "/book",
  "/video",
];

function isStickyAppPath(bare: string): boolean {
  return DESK_OR_AUTH_PREFIXES.some((prefix) => bare === prefix || bare.startsWith(`${prefix}/`));
}

/**
 * Where the language toggle should navigate. `null` = stay on this URL and
 * only change the store (Explore, desks, listings, unpaired marketing).
 */
export function localeSwitchPath(pathname: string, nextLocale: string): string | null {
  const current = normalizePathname(pathname);
  const bare = stripLocalePrefix(current);

  if (isStickyAppPath(bare)) {
    if (isFrPath(current) && (nextLocale === "en" || nextLocale !== "fr")) return bare;
    return null;
  }

  if (!isPairedPath(bare)) {
    if (isFrPath(current) && nextLocale !== "fr") return bare;
    return null;
  }

  if (nextLocale === "fr") {
    const next = frenchPath(bare);
    return next === current ? null : next;
  }

  if (isFrPath(current)) return bare;
  return null;
}

export function hreflangLinks(
  pathname: string,
  origin = "https://www.kidease.ca",
): Array<{ rel: "alternate"; hrefLang: string; href: string }> {
  const bare = stripLocalePrefix(pathname);
  if (!isPairedPath(bare) || REDIRECT.has(bare)) return [];
  const en = absoluteUrl(bare, origin);
  const fr = absoluteUrl(frenchPath(bare), origin);
  return [
    { rel: "alternate", hrefLang: "en", href: en },
    { rel: "alternate", hrefLang: "fr", href: fr },
    { rel: "alternate", hrefLang: "x-default", href: en },
  ];
}

export function absoluteUrl(path: string, origin = "https://www.kidease.ca"): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (clean === "/") return `${origin}/`;
  return `${origin}${clean}`;
}
