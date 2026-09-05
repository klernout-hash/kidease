/**
 * Live Sign in with Apple (Apple's own IDP at appleid.apple.com).
 *
 * The Grok auth broker only federates Google (`idp` must be google). Apple
 * and Facebook therefore talk to their own IDPs via Better Auth's social
 * providers — not the broker.
 *
 * Required process env (injected on the host; never commit a .env file):
 *   APPLE_CLIENT_ID   Services ID, e.g. ca.kidease.web
 *   APPLE_TEAM_ID     10-char Apple Developer Team ID
 *   APPLE_KEY_ID      10-char Sign in with Apple key id
 *   APPLE_PRIVATE_KEY PKCS8 .p8 contents (newlines may be \n)
 */
import { createPrivateKey, createSign } from "node:crypto";

const env = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

export const APPLE_CLIENT_ID = env("APPLE_CLIENT_ID");
const APPLE_TEAM_ID = env("APPLE_TEAM_ID");
const APPLE_KEY_ID = env("APPLE_KEY_ID");
const APPLE_PRIVATE_KEY = env("APPLE_PRIVATE_KEY")?.replace(/\\n/g, "\n");

export const appleIdpConfigured = Boolean(
  APPLE_CLIENT_ID && APPLE_TEAM_ID && APPLE_KEY_ID && APPLE_PRIVATE_KEY,
);

/** ES256 client-secret JWT Apple requires at the token endpoint. Valid 180 days. */
export function appleClientSecret(): string | undefined {
  if (!appleIdpConfigured || !APPLE_CLIENT_ID || !APPLE_TEAM_ID || !APPLE_KEY_ID || !APPLE_PRIVATE_KEY) {
    return undefined;
  }
  const header = b64url(JSON.stringify({ alg: "ES256", kid: APPLE_KEY_ID }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(
    JSON.stringify({
      iss: APPLE_TEAM_ID,
      iat: now,
      exp: now + 60 * 60 * 24 * 180,
      aud: "https://appleid.apple.com",
      sub: APPLE_CLIENT_ID,
    }),
  );
  const key = createPrivateKey(APPLE_PRIVATE_KEY);
  const signer = createSign("SHA256");
  signer.update(`${header}.${payload}`);
  const sig = signer.sign({ key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${header}.${payload}.${sig}`;
}

function b64url(value: string) {
  return Buffer.from(value).toString("base64url");
}
