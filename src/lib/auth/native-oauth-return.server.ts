import { createHash, randomBytes } from "node:crypto";
import { isNativeUserAgent } from "@/lib/native-entitlements";
import {
  isKideasePublicHost,
  KIDEASE_COOKIE_DOMAIN,
  parseCookieHeader,
  readSessionTokenFromHeader,
  SESSION_TOKEN_COOKIE,
  SHARED_SESSION_TOKEN_COOKIE,
  unsignedSessionToken,
} from "./cookies";
import { googleSignInEnabled } from "./google-login-flag";
import { amazonSignInVisible, huaweiSignInVisible } from "./store-signin-flags";
import {
  NATIVE_AUTH_VERIFIER_COOKIE,
  nativeAuthFinishUrl,
  nativeHandoffVerifierHash,
  nativeOAuthProvider,
  nativeOAuthReturnPath,
  safeInAppPath,
  sanitizeNativeOAuthError,
} from "./native-oauth";

type Sql = Awaited<ReturnType<typeof import("@/lib/db").getSql>>;

const HANDOFF_SECONDS = 120;
const VERIFIER_SECONDS = 60 * 15;
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

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
 * POST /auth/native-prepare from the webview, before it opens the sheet.
 * The verifier stays in this webview's cookie jar (HttpOnly, host-only). The
 * response carries only its hash, which travels through the sheet as `hv`.
 */
export async function handleNativeAuthPrepare(request: Request): Promise<Response> {
  const site = request.headers.get("sec-fetch-site");
  if (
    request.method !== "POST" ||
    (site && site !== "same-origin") ||
    !isNativeUserAgent(request.headers.get("user-agent"))
  ) {
    return new Response(null, { status: 403, headers: { "cache-control": "no-store" } });
  }
  const verifier = randomBytes(32).toString("base64url");
  const headers = new Headers({
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  headers.append(
    "set-cookie",
    `${NATIVE_AUTH_VERIFIER_COOKIE}=${verifier}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${VERIFIER_SECONDS}`,
  );
  return new Response(JSON.stringify({ hv: sha256Hex(verifier) }), { status: 200, headers });
}

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
  const hv = nativeHandoffVerifierHash(url.searchParams.get("hv"));
  if (
    !provider ||
    (provider === "google" && !googleSignInEnabled(process.env)) ||
    (provider === "huawei" && !huaweiSignInVisible(process.env)) ||
    (provider === "amazon" && !amazonSignInVisible(process.env))
  ) {
    return redirect(nativeAuthFinishUrl({ next: errorNext, error: "oauth_provider_not_found" }));
  }
  try {
    const { auth } = await import("./server");
    const apiRes = await auth.api.signInSocial({
      body: {
        provider,
        callbackURL: nativeOAuthReturnPath(next, hv),
        errorCallbackURL: nativeOAuthReturnPath(errorNext, hv),
        ...(newUser ? { newUserCallbackURL: nativeOAuthReturnPath(newUser, hv) } : {}),
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

/**
 * Runs in the system auth sheet after Better Auth has set a session cookie
 * there. Mint a one-time code bound to the webview's verifier hash and leave
 * via the app scheme. No session: still return to the webview so the person
 * is not stuck in Safari or Chrome.
 */
export async function handleNativeAuthAppReturn(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const next = safeInAppPath(url.searchParams.get("next"));
  const hv = nativeHandoffVerifierHash(url.searchParams.get("hv"));
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
      insert into native_auth_handoff (code, session_token, next_path, expires_at, verifier_hash)
      values (${code}, ${raw}, ${next}, ${expires}, ${hv})
    `;
    return redirect(nativeAuthFinishUrl({ code, next }));
  } catch (err) {
    console.error("[kidease-auth] native return skipped", err instanceof Error ? err.message : "error");
    return redirect(nativeAuthFinishUrl({ next }));
  }
}

async function hasLiveSession(sql: Sql, cookieHeader: string | null): Promise<boolean> {
  const cookies = parseCookieHeader(cookieHeader);
  for (const name of [SESSION_TOKEN_COOKIE, SHARED_SESSION_TOKEN_COOKIE]) {
    const token = unsignedSessionToken(cookies.get(name));
    if (!token) continue;
    const rows = await sql<{ token: string }>`
      select token from "session" where token = ${token} and "expiresAt" > now() limit 1
    `;
    if (rows[0]) return true;
  }
  return false;
}

/**
 * Webview-only. Sets the session cookie that was created in the auth sheet,
 * but only for the webview holding the verifier whose hash the code was
 * minted with. A webview that is already signed in keeps its session.
 */
export async function handleNativeAuthHandoff(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const next = safeInAppPath(url.searchParams.get("next"));
  const code = String(url.searchParams.get("code") || "").trim();
  if (!code || code.length > 128) return redirect(next);
  if (request.method !== "GET" || !isNativeUserAgent(request.headers.get("user-agent"))) return redirect(next);
  const cookieHeader = request.headers.get("cookie");
  const verifier = parseCookieHeader(cookieHeader).get(NATIVE_AUTH_VERIFIER_COOKIE);
  if (!verifier || verifier.length > 128) return redirect(next);
  const verifierHash = sha256Hex(verifier);
  try {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    if (await hasLiveSession(sql, cookieHeader)) return redirect(next);
    // One statement checks the verifier and consumes the code, so the session
    // set below is the one bound to this webview.
    const rows = await sql<{ session_token: string; next_path: string }>`
      delete from native_auth_handoff
      where code = ${code} and verifier_hash = ${verifierHash} and expires_at > now()
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
