export const PUBLIC_STATIC_EDGE_CACHE: string;

export function normalizePublicPath(pathname: string): string;
export function isPublicStaticDocument(pathname: string): boolean;
export function publicStaticCacheControl(input?: {
  pathname?: string;
  method?: string;
  cookie?: string | null;
  status?: number | null;
  setCookie?: string | null;
}): string | null;
export function applyPublicStaticCache(
  headers: Headers,
  input?: {
    pathname?: string;
    method?: string;
    cookie?: string | null;
    status?: number | null;
    setCookie?: string | null;
  },
): boolean;
