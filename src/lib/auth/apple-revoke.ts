/**
 * Apple token revocation (App Store 5.1.1(v)).
 * POST https://appleid.apple.com/auth/revoke
 * No secrets are logged. Tests pass a mock fetch.
 */

export const APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke";

export function appleRevokeForm(input: {
  clientId: string;
  clientSecret: string;
  token: string;
  tokenTypeHint: "access_token" | "refresh_token";
}): string {
  return new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    token: input.token,
    token_type_hint: input.tokenTypeHint,
  }).toString();
}

export type AppleRevokeResult = {
  skipped: boolean;
  attempted: number;
  ok: number;
};

export async function revokeAppleSignInTokens(input: {
  clientId: string;
  clientSecret: string;
  refreshToken?: string | null;
  accessToken?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<AppleRevokeResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const tokens: Array<{ token: string; tokenTypeHint: "access_token" | "refresh_token" }> = [];
  const refresh = String(input.refreshToken || "").trim();
  const access = String(input.accessToken || "").trim();
  if (refresh) tokens.push({ token: refresh, tokenTypeHint: "refresh_token" });
  if (access && access !== refresh) tokens.push({ token: access, tokenTypeHint: "access_token" });
  if (!tokens.length || !input.clientId || !input.clientSecret) {
    return { skipped: true, attempted: 0, ok: 0 };
  }
  let ok = 0;
  for (const item of tokens) {
    const response = await fetchImpl(APPLE_REVOKE_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: appleRevokeForm({
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        token: item.token,
        tokenTypeHint: item.tokenTypeHint,
      }),
    });
    if (response.ok) ok += 1;
  }
  return { skipped: false, attempted: tokens.length, ok };
}
