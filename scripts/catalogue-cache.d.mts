export const PUBLIC_CATALOGUE_CACHE_CONTROL: string;
export const SESSION_COOKIE_NAMES: string[];
export const LISTING_FN_IDS: Map<string, string>;
export function serverFnIdFromPath(pathname: string | null | undefined): string;
export function hasSessionCookie(cookieHeader: string | null | undefined): boolean;
export function listingBodyIsPublic(body: string | null | undefined): boolean;
export function catalogueCacheControl(input?: {
  pathname?: string | null;
  method?: string | null;
  status?: number | null;
  cookie?: string | null;
  setCookie?: string | null;
  cacheControl?: string | null;
  bodyText?: string | null;
}): string | null;
