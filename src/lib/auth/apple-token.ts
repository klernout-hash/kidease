/**
 * Exchange a native Sign in with Apple authorization code for a refresh token.
 * The native sheet is issued to the bundle id, not the web Services ID.
 * No redirect_uri: ASAuthorization does not use one.
 * Failures are logged without the code or the tokens.
 */
import { logAppleAuthFailure } from "./apple-auth-log.ts";

export const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";
/** App ID / bundle id. Native revoke and token exchange use this client_id. */
export const NATIVE_APPLE_CLIENT_ID = "ca.kidease.app";

export function appleAuthorizationCodeForm(input: {
  clientId: string;
  clientSecret: string;
  code: string;
}): string {
  return new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    client_id: input.clientId,
    client_secret: input.clientSecret,
  }).toString();
}

export type AppleTokenExchange = {
  ok: boolean;
  status: number;
  refreshToken: string | null;
  accessToken: string | null;
  error: string | null;
};

export async function exchangeAppleAuthorizationCode(input: {
  clientId: string;
  clientSecret: string;
  code: string;
  fetchImpl?: typeof fetch;
}): Promise<AppleTokenExchange> {
  const code = input.code.trim();
  const clientId = input.clientId.trim();
  if (!code || !clientId || !input.clientSecret) {
    logAppleAuthFailure("exchange", { status: 0, error: "missing_input", clientId });
    return { ok: false, status: 0, refreshToken: null, accessToken: null, error: "missing_input" };
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(APPLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: appleAuthorizationCodeForm({ clientId, clientSecret: input.clientSecret, code }),
  });
  let error: string | null = null;
  let refreshToken: string | null = null;
  let accessToken: string | null = null;
  try {
    const body = (await response.json()) as {
      error?: unknown;
      refresh_token?: unknown;
      access_token?: unknown;
    };
    error = typeof body.error === "string" ? body.error : null;
    refreshToken = typeof body.refresh_token === "string" && body.refresh_token.trim() ? body.refresh_token : null;
    accessToken = typeof body.access_token === "string" && body.access_token.trim() ? body.access_token : null;
  } catch {
    error = "unreadable";
  }
  if (!response.ok || !refreshToken) {
    logAppleAuthFailure("exchange", {
      status: response.status,
      error: error || "no_refresh_token",
      clientId,
    });
    return {
      ok: false,
      status: response.status,
      refreshToken,
      accessToken,
      error: error || "no_refresh_token",
    };
  }
  return { ok: true, status: response.status, refreshToken, accessToken, error: null };
}
