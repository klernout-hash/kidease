/**
 * Store the refresh token from a native Sign in with Apple authorization code.
 * client_id is the bundle id. Sign-in still succeeds when this returns ok: false.
 * The caller logs nothing that contains the code or the tokens.
 */
import { appleClientSecretFrom, readAppleIdpConfig } from "./apple-idp.ts";
import { logAppleAuthFailure } from "./apple-auth-log.ts";
import { exchangeAppleAuthorizationCode, NATIVE_APPLE_CLIENT_ID } from "./apple-token.ts";

/** account.scope value that tells revoke to use the bundle id, not the Services ID. */
export const NATIVE_APPLE_SCOPE = "native";

type AccountSql = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<Array<{ id?: string }>>;

async function encryptToken(value: string, encrypt?: (plain: string) => Promise<string>): Promise<string> {
  if (encrypt) return encrypt(value);
  const key = process.env.BETTER_AUTH_SECRET?.trim();
  if (!key) return value;
  try {
    const crypto = (await import("better-auth/crypto")) as {
      symmetricEncrypt?: (input: { key: string; data: string }) => Promise<string>;
    };
    if (typeof crypto.symmetricEncrypt !== "function") return value;
    const sealed = await crypto.symmetricEncrypt({ key, data: value });
    return typeof sealed === "string" && sealed.trim() ? sealed : value;
  } catch {
    logAppleAuthFailure("exchange", { status: 0, error: "encrypt_failed", clientId: NATIVE_APPLE_CLIENT_ID });
    return value;
  }
}

export async function persistNativeAppleTokens(input: {
  userId: string;
  authorizationCode: string;
  sql: AccountSql;
  fetchImpl?: typeof fetch;
  encrypt?: (plain: string) => Promise<string>;
}): Promise<{ ok: boolean }> {
  const config = readAppleIdpConfig();
  const clientId = config?.bundleId || NATIVE_APPLE_CLIENT_ID;
  if (!config) {
    logAppleAuthFailure("exchange", { status: 0, error: "apple_not_configured", clientId });
    return { ok: false };
  }
  let exchanged: Awaited<ReturnType<typeof exchangeAppleAuthorizationCode>>;
  try {
    exchanged = await exchangeAppleAuthorizationCode({
      clientId,
      clientSecret: appleClientSecretFrom(config, Math.floor(Date.now() / 1000), clientId),
      code: input.authorizationCode,
      fetchImpl: input.fetchImpl,
    });
  } catch {
    logAppleAuthFailure("exchange", { status: 0, error: "fetch_failed", clientId });
    return { ok: false };
  }
  if (!exchanged.ok || !exchanged.refreshToken) return { ok: false };
  try {
    const refreshToken = await encryptToken(exchanged.refreshToken, input.encrypt);
    const accessToken = exchanged.accessToken ? await encryptToken(exchanged.accessToken, input.encrypt) : null;
    const rows = await input.sql`
      update "account"
      set "refreshToken" = ${refreshToken},
          "accessToken" = coalesce(${accessToken}, "accessToken"),
          "scope" = ${NATIVE_APPLE_SCOPE}
      where "userId" = ${input.userId} and "providerId" = 'apple'
      returning "id"
    `;
    if (!rows.length) {
      logAppleAuthFailure("exchange", { status: exchanged.status, error: "account_row_missing", clientId });
      return { ok: false };
    }
    return { ok: true };
  } catch {
    logAppleAuthFailure("exchange", { status: exchanged.status, error: "account_write_failed", clientId });
    return { ok: false };
  }
}
