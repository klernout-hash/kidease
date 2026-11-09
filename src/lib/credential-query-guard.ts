/**
 * A password must never travel in a URL.
 * The login form used to fall back to a browser GET, which put the password
 * in the query string. This guard answers that request with a clean redirect
 * and does not read the value into a log line.
 */

const SECRET_KEYS = new Set(["password", "pass", "pwd"]);

const AUTH_PATHS = new Set([
  "/login",
  "/fr/login",
  "/signup",
  "/fr/signup",
  "/forgot-password",
  "/fr/forgot-password",
  "/reset-password",
  "/fr/reset-password",
  "/verify-2fa",
  "/fr/verify-2fa",
  "/gov/login",
  "/fr/gov/login",
  "/kiosk",
]);

export function isCredentialAuthPath(pathname: string): boolean {
  return AUTH_PATHS.has(pathname);
}

export function queryCarriesSecret(params: URLSearchParams): boolean {
  for (const key of params.keys()) {
    if (SECRET_KEYS.has(key.toLowerCase())) return true;
  }
  return false;
}

/** Path only. No query, no hash, no secret. Null when the request is safe. */
export function credentialQueryLocation(url: URL): string | null {
  if (!isCredentialAuthPath(url.pathname)) return null;
  if (!queryCarriesSecret(url.searchParams)) return null;
  return url.pathname;
}

export function credentialQueryHeaders(): Record<string, string> {
  return {
    location: "",
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
  };
}
