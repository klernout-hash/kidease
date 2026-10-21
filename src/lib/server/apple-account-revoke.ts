/**
 * Revoke Sign in with Apple tokens when an account is deleted (Apple 5.1.1(v)).
 * Missing Apple config, a decrypt miss, or a revoke HTTP error must not block deletion.
 * Token values are never logged.
 */
import { logAppleAuthFailure } from "@/lib/auth/apple-auth-log";
import { NATIVE_APPLE_SCOPE } from "@/lib/auth/apple-native-store";
import { APPLE_CLIENT_ID, appleClientSecret, appleClientSecretFrom, appleIdpConfigured, readAppleIdpConfig } from "@/lib/auth/apple-idp";
import { revokeAppleSignInTokens } from "@/lib/auth/apple-revoke";
import { NATIVE_APPLE_CLIENT_ID } from "@/lib/auth/apple-token";
import { getSql } from "@/lib/db";

type AppleAccountRow = {
  accessToken: string | null;
  refreshToken: string | null;
  scope: string | null;
};

export async function revokeStoredAppleSignIn(userId: string): Promise<void> {
  try {
    const config = readAppleIdpConfig();
    if (!appleIdpConfigured || !config || !APPLE_CLIENT_ID) return;
    const sql = await getSql();
    const rows = await sql<AppleAccountRow>`
      select "accessToken", "refreshToken", "scope"
      from "account"
      where "userId" = ${userId} and "providerId" = 'apple'
    `.catch(() => [] as AppleAccountRow[]);
    for (const row of rows) {
      const native = String(row.scope || "") === NATIVE_APPLE_SCOPE;
      const clientId = native ? config.bundleId || NATIVE_APPLE_CLIENT_ID : APPLE_CLIENT_ID;
      const clientSecret = native
        ? appleClientSecretFrom(config, Math.floor(Date.now() / 1000), clientId)
        : appleClientSecret();
      if (!clientSecret) {
        logAppleAuthFailure("revoke", { status: 0, error: "missing_client_secret", clientId });
        continue;
      }
      await revokeAppleSignInTokens({
        clientId,
        clientSecret,
        accessToken: await maybeDecryptToken(row.accessToken),
        refreshToken: await maybeDecryptToken(row.refreshToken),
      });
    }
  } catch {
    logAppleAuthFailure("revoke", { status: 0, error: "revoke_threw", clientId: NATIVE_APPLE_CLIENT_ID });
  }
}

async function maybeDecryptToken(value: string | null | undefined): Promise<string | null> {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const key = process.env.BETTER_AUTH_SECRET?.trim();
  if (!key) return raw;
  try {
    const crypto = (await import("better-auth/crypto")) as {
      symmetricDecrypt?: (input: { key: string; data: string }) => Promise<string>;
    };
    if (typeof crypto.symmetricDecrypt !== "function") return raw;
    const plain = await crypto.symmetricDecrypt({ key, data: raw });
    return typeof plain === "string" && plain.trim() ? plain : raw;
  } catch {
    return raw;
  }
}
