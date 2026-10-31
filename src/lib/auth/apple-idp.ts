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
 *   APPLE_BUNDLE_ID   optional, default ca.kidease.app
 *
 * Tests pass a generated key into appleClientSecretFrom. They do not read a real .p8.
 */
import { createPrivateKey, createSign } from "node:crypto";

export type AppleIdpConfig = {
  clientId: string;
  teamId: string;
  keyId: string;
  privateKey: string;
  bundleId: string;
};

function envValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

/** Four APPLE_* values, or null. The login button stays hidden when this is null. */
export function readAppleIdpConfig(env: NodeJS.ProcessEnv = process.env): AppleIdpConfig | null {
  const clientId = envValue(env, "APPLE_CLIENT_ID");
  const teamId = envValue(env, "APPLE_TEAM_ID");
  const keyId = envValue(env, "APPLE_KEY_ID");
  const privateKey = envValue(env, "APPLE_PRIVATE_KEY")?.replace(/\\n/g, "\n");
  if (!clientId || !teamId || !keyId || !privateKey) return null;
  return {
    clientId,
    teamId,
    keyId,
    privateKey,
    bundleId: envValue(env, "APPLE_BUNDLE_ID") || "ca.kidease.app",
  };
}

const loaded = readAppleIdpConfig();

export const APPLE_CLIENT_ID = loaded?.clientId;
export const appleIdpConfigured = Boolean(loaded);

/**
 * Audiences Better Auth must accept on an Apple identity token.
 *
 * Better Auth 1.7 uses `audience` when it is set. If only `appBundleIdentifier`
 * is set, that bundle id replaces the Services ID, and web Sign in with Apple
 * fails the `aud` check. Native tokens use `ca.kidease.app`. Web tokens use
 * the Services ID (`APPLE_CLIENT_ID`). Both have to be in the list.
 */
export function appleIdTokenAudiences(clientId: string, bundleId = "ca.kidease.app"): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of [clientId, bundleId]) {
    const id = value.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * ES256 client-secret JWT Apple requires at the token endpoint. Valid 180 days.
 * `subject` is the client_id that issued the token: the Services ID on the web,
 * or the bundle id `ca.kidease.app` for the native sheet.
 */
export function appleClientSecretFrom(
  config: AppleIdpConfig,
  nowSec = Math.floor(Date.now() / 1000),
  subject = config.clientId,
): string {
  const header = b64url(JSON.stringify({ alg: "ES256", kid: config.keyId, typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      iss: config.teamId,
      iat: nowSec,
      exp: nowSec + 60 * 60 * 24 * 180,
      aud: "https://appleid.apple.com",
      sub: subject,
    }),
  );
  const key = createPrivateKey(config.privateKey);
  const signer = createSign("SHA256");
  signer.update(`${header}.${payload}`);
  const sig = signer.sign({ key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${header}.${payload}.${sig}`;
}

export function appleClientSecret(): string | undefined {
  if (!loaded) return undefined;
  return appleClientSecretFrom(loaded);
}

function b64url(value: string) {
  return Buffer.from(value).toString("base64url");
}
