/**
 * Revoke Sign in with Apple tokens when an account is deleted (Apple 5.1.1(v)).
 * Missing Apple config, a decrypt miss, or a revoke HTTP error must not block deletion.
 * Token values are never logged.
 */
import { APPLE_CLIENT_ID, appleClientSecret, appleIdpConfigured } from "@/lib/auth/apple-idp";
import { revokeAppleSignInTokens } from "@/lib/auth/apple-revoke";
import { getSql } from "@/lib/db";

type AppleAccountRow = {
  accessToken: string | null;
  refreshToken: string | null;
};

export async function revokeStoredAppleSignIn(userId: string): Promise<void> {
  try {
    if (!appleIdpConfigured || !APPLE_CLIENT_ID) return;
    const clientSecret = appleClientSecret();
    if (!clientSecret) return;
    const sql = await getSql();
    const rows = await sql<AppleAccountRow>`
      select "accessToken", "refreshToken"
      from "account"
      where "userId" = ${userId} and "providerId" = 'apple'
    `.catch(() => [] as AppleAccountRow[]);
    for (const row of rows) {
      await revokeAppleSignInTokens({
        clientId: APPLE_CLIENT_ID,
        clientSecret,
        accessToken: await maybeDecryptToken(row.accessToken),
        refreshToken: await maybeDecryptToken(row.refreshToken),
      });
    }
  } catch {
    /* Account deletion continues. */
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
