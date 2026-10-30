import { randomBytes } from "node:crypto";
import {
  isKideasePublicHost,
  KIDEASE_COOKIE_DOMAIN,
  readSessionTokenFromHeader,
  SESSION_TOKEN_COOKIE,
  SHARED_SESSION_TOKEN_COOKIE,
  unsignedSessionToken,
} from "./cookies";
import {
  nativeAuthFinishUrl,
  nativeOAuthProvider,
  nativeOAuthReturnPath,
  safeInAppPath,
  sanitizeNativeOAuthError,
} from "./native-oauth";

const HANDOFF_SECONDS = 120;
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function redirect(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      location,
      "cache-control": "no-store",
    },
  });
}

function sessionCookies(value: string, publicHost: boolean): string[] {
  const host = `${SESSION_TOKEN_COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`;
  if (!publicHost) return [host];
  return [
    host,
    `${SHARED_SESSION_TOKEN_COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}; Domain=${KIDEASE_COOKIE_DOMAIN}`,
  ];
}

/**
 * Runs in the system auth sheet after Better Auth has set a session cookie
 * there. Mint a one-time code and leave via the app scheme. No session: still
 * return to the webview so the person is not stuck in Safari or Chrome.
 */
/**
 * GET /auth/native-start inside the system auth sheet.
 * Better Auth sets the OAuth state cookie on this response, then the sheet
 * follows the provider. The WebView never sees that cookie.
 */
export async function handleNativeAuthStart(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const provider = nativeOAuthProvider(url.searchParams.get("provider"));
  const next = safeInAppPath(url.searchParams.get("next"));
  const errorNext = safeInAppPath(url.searchParams.get("errorNext") || next);
  const newUser = url.searchParams.get("newUser");
  if (!provider) return redirect(nativeAuthFinishUrl({ next: errorNext, error: "oauth_provider_not_found" }));
  try {
    const { auth } = await import("./server");
    const apiRes = await auth.api.signInSocial({
      body: {
        provider,
        callbackURL: nativeOAuthReturnPath(next),
        errorCallbackURL: nativeOAuthReturnPath(errorNext),
        ...(newUser ? { newUserCallbackURL: nativeOAuthReturnPath(newUser) } : {}),
      },
      headers: request.headers,
      asResponse: true,
    });
    const body = (await apiRes.json().catch(() => null)) as { url?: string } | null;
    const location = apiRes.headers.get("location") || body?.url || "";
    if (!apiRes.ok || !location.startsWith("https://")) {
      console.error("[kidease-auth] native start skipped", provider, apiRes.status);
      return redirect(nativeAuthFinishUrl({ next: errorNext, error: "oauth_start_failed" }));
    }
    const headers = new Headers({ location, "cache-control": "no-store" });
    for (const cookie of apiRes.headers.getSetCookie()) {
      headers.append("set-cookie", cookie);
    }
    return new Response(null, { status: 302, headers });
  } catch (err) {
    console.error("[kidease-auth] native start skipped", err instanceof Error ? err.message : "error");
    return redirect(nativeAuthFinishUrl({ next: errorNext, error: "oauth_start_failed" }));
  }
}

export async function handleNativeAuthAppReturn(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const next = safeInAppPath(url.searchParams.get("next"));
  const oauthError = sanitizeNativeOAuthError(url.searchParams.get("error"));
  if (oauthError) return redirect(nativeAuthFinishUrl({ next, error: oauthError }));
  const raw = readSessionTokenFromHeader(request.headers.get("cookie"));
  const token = unsignedSessionToken(raw);
  if (!raw || !token) return redirect(nativeAuthFinishUrl({ next }));
  try {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ token: string }>`
      select token from "session" where token = ${token} and "expiresAt" > now() limit 1
    `;
    if (!rows[0]) return redirect(nativeAuthFinishUrl({ next }));
    const code = randomBytes(24).toString("base64url");
    const expires = new Date(Date.now() + HANDOFF_SECONDS * 1000).toISOString();
    await sql`
      insert into native_auth_handoff (code, session_token, next_path, expires_at)
      values (${code}, ${raw}, ${next}, ${expires})
    `;
    return redirect(nativeAuthFinishUrl({ code, next }));
  } catch (err) {
    console.error("[kidease-auth] native return skipped", err instanceof Error ? err.message : "error");
    return redirect(nativeAuthFinishUrl({ next }));
  }
}

/** Webview-only. Sets the session cookie that was created in the auth sheet. */
export async function handleNativeAuthHandoff(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const next = safeInAppPath(url.searchParams.get("next"));
  const code = String(url.searchParams.get("code") || "").trim();
  if (!code || code.length > 128) return redirect(next);
  try {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ session_token: string; next_path: string }>`
      delete from native_auth_handoff
      where code = ${code} and expires_at > now()
      returning session_token, next_path
    `;
    const row = rows[0];
    if (!row?.session_token) return redirect(next);
    const dest = safeInAppPath(row.next_path || next);
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    const headers = new Headers({
      location: dest,
      "cache-control": "no-store",
    });
    for (const cookie of sessionCookies(row.session_token, isKideasePublicHost(host))) {
      headers.append("set-cookie", cookie);
    }
    return new Response(null, { status: 302, headers });
  } catch (err) {
    console.error("[kidease-auth] native handoff skipped", err instanceof Error ? err.message : "error");
    return redirect(next);
  }
}
