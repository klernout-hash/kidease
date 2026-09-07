/**
 * Session cookie names and apex/www sharing.
 *
 * Better Auth still issues `__Host-grok-auth.*` (no Domain) so grok.me /
 * preview siblings cannot toss a `Domain=.grok.me` cookie at this app.
 *
 * `__Host-` is host-only: a session set on kidease.ca is invisible on
 * www.kidease.ca and the other way around. Production also sets
 * `__Secure-kidease.*` with `Domain=kidease.ca` so both public hosts share
 * the same session (and 2FA device) token.
 */

export const SESSION_TOKEN_COOKIE = "__Host-grok-auth.session_token";
export const SHARED_SESSION_TOKEN_COOKIE = "__Secure-kidease.session_token";

export const TWO_FACTOR_COOKIE = "__Host-kidease.2fa";
export const SHARED_TWO_FACTOR_COOKIE = "__Secure-kidease.2fa";

export const KIDEASE_COOKIE_DOMAIN = "kidease.ca";

const HOST_TO_SHARED: Record<string, string> = {
  [SESSION_TOKEN_COOKIE]: SHARED_SESSION_TOKEN_COOKIE,
  ["__Host-grok-auth.session_data"]: "__Secure-kidease.session_data",
  ["__Host-grok-auth.account_data"]: "__Secure-kidease.account_data",
  ["__Host-grok-auth.dont_remember"]: "__Secure-kidease.dont_remember",
  [TWO_FACTOR_COOKIE]: SHARED_TWO_FACTOR_COOKIE,
};

const SHARED_TO_HOST = Object.fromEntries(
  Object.entries(HOST_TO_SHARED).map(([host, shared]) => [shared, host]),
);

export function hostnameOf(hostHeader?: string | null): string {
  const first = String(hostHeader ?? "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (!first) return "";
  if (first.startsWith("[")) {
    const end = first.indexOf("]");
    return end >= 0 ? first.slice(1, end) : first;
  }
  return first.split(":")[0] ?? "";
}

/** Apex + www only — not grok.me, vercel.app, or localhost. */
export function isKideasePublicHost(hostHeader?: string | null): boolean {
  const host = hostnameOf(hostHeader);
  return host === "kidease.ca" || host === "www.kidease.ca";
}

export function parseCookieHeader(header?: string | null): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of String(header ?? "").split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const name = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (name && !out.has(name)) out.set(name, value);
  }
  return out;
}

export function pickCookieValue(
  header: string | null | undefined,
  names: readonly string[],
): string | null {
  const cookies = parseCookieHeader(header);
  for (const name of names) {
    const value = cookies.get(name);
    if (value) return value;
  }
  return null;
}

/** Prefer the host-only cookie, then the shared apex/www alias. */
export function readSessionTokenFromHeader(header?: string | null): string | null {
  return pickCookieValue(header, [SESSION_TOKEN_COOKIE, SHARED_SESSION_TOKEN_COOKIE]);
}

export function readTwoFactorFromHeader(header?: string | null): string | null {
  return pickCookieValue(header, [TWO_FACTOR_COOKIE, SHARED_TWO_FACTOR_COOKIE]);
}

/**
 * Copy a shared `__Secure-kidease.*` cookie onto the `__Host-` name Better Auth
 * reads, so getSession works after a www↔apex hop.
 */
export function aliasInboundAuthCookies(cookieHeader?: string | null): string {
  const cookies = parseCookieHeader(cookieHeader);
  for (const [shared, host] of Object.entries(SHARED_TO_HOST)) {
    const value = cookies.get(shared);
    if (value && !cookies.get(host)) cookies.set(host, value);
  }
  return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

export function requestWithAliasedAuthCookies(request: Request): Request {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!isKideasePublicHost(host)) return request;
  const raw = request.headers.get("cookie");
  const aliased = aliasInboundAuthCookies(raw);
  if (aliased === (raw || "")) return request;
  const headers = new Headers(request.headers);
  headers.set("cookie", aliased);
  return new Request(request, { headers });
}

function cookieNameOf(setCookie: string): string {
  return setCookie.split("=", 1)[0]?.trim() ?? "";
}

function stripDomain(setCookie: string): string {
  return setCookie.replace(/;\s*domain=[^;]*/gi, "");
}

/**
 * Duplicate each `__Host-` Set-Cookie as `__Secure-kidease.*` with
 * `Domain=kidease.ca`. Browsers reject `__Host-` cookies that carry Domain.
 */
export function shareOutboundAuthCookies(setCookieHeaders: string[]): string[] {
  const extra: string[] = [];
  for (const header of setCookieHeaders) {
    const name = cookieNameOf(header);
    const shared = HOST_TO_SHARED[name];
    if (!shared) continue;
    const valueAndAttrs = header.slice(name.length);
    const sharedHeader = stripDomain(`${shared}${valueAndAttrs}`)
      .replace(/;\s*samesite=[^;]*/i, "")
      .concat(`; Domain=${KIDEASE_COOKIE_DOMAIN}; SameSite=Lax`);
    extra.push(sharedHeader);
  }
  return extra;
}

export function mergeSetCookieHeaders(
  existing: string[],
  requestHost?: string | null,
): string[] {
  if (!isKideasePublicHost(requestHost)) return existing;
  return [...existing, ...shareOutboundAuthCookies(existing)];
}

export function applySharedAuthCookies(request: Request, response: Response): Response {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
  if (!isKideasePublicHost(host)) return response;
  const existing =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : response.headers.get("set-cookie")
        ? [response.headers.get("set-cookie") as string]
        : [];
  const merged = mergeSetCookieHeaders(existing, host);
  if (merged.length === existing.length) return response;
  const headers = new Headers(response.headers);
  headers.delete("set-cookie");
  for (const cookie of merged) headers.append("set-cookie", cookie);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
