import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { appleClientSecretFrom, readAppleIdpConfig } from "../src/lib/auth/apple-idp.ts";
import { appleNativeIdToken, appleNoncePair, appleSignInRoute, sha256Hex } from "../src/lib/auth/apple-native.ts";
import { APPLE_REVOKE_URL, appleRevokeForm, revokeAppleSignInTokens } from "../src/lib/auth/apple-revoke.ts";
import { visibleSignInProviders } from "../src/lib/auth/providers.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("Apple button stays hidden until nativeApple is true", () => {
  const hidden = visibleSignInProviders({ nativeGoogle: true, broker: false, nativeApple: false });
  assert.equal(hidden.some((provider) => provider.providerId === "apple"), false);
  const shown = visibleSignInProviders({ nativeGoogle: false, broker: false, nativeApple: true });
  assert.equal(shown[0]?.providerId, "apple");
});

test("readAppleIdpConfig needs all four values and ignores the enrolment id", () => {
  assert.equal(readAppleIdpConfig({}), null);
  assert.equal(
    readAppleIdpConfig({
      APPLE_CLIENT_ID: "ca.kidease.web",
      APPLE_TEAM_ID: "B7UM5AC9JQ",
      APPLE_KEY_ID: "KEYID12345",
    }),
    null,
  );
  const config = readAppleIdpConfig({
    APPLE_CLIENT_ID: " ca.kidease.web ",
    APPLE_TEAM_ID: "TEAMID1234",
    APPLE_KEY_ID: "KEYID12345",
    APPLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nline\\n-----END PRIVATE KEY-----",
  });
  assert.equal(config?.clientId, "ca.kidease.web");
  assert.equal(config?.bundleId, "ca.kidease.app");
  assert.match(config?.privateKey ?? "", /\nline\n/);
});

test("client secret is an ES256 JWT from a generated key", () => {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const token = appleClientSecretFrom(
    {
      clientId: "ca.kidease.web",
      teamId: "TEAMID1234",
      keyId: "KEYID12345",
      privateKey: pem,
      bundleId: "ca.kidease.app",
    },
    1_700_000_000,
  );
  const [header, payload, sig] = token.split(".");
  assert.equal(token.split(".").length, 3);
  assert.ok(sig.length > 10);
  const head = JSON.parse(Buffer.from(header, "base64url").toString());
  const body = JSON.parse(Buffer.from(payload, "base64url").toString());
  assert.equal(head.alg, "ES256");
  assert.equal(head.kid, "KEYID12345");
  assert.equal(body.iss, "TEAMID1234");
  assert.equal(body.sub, "ca.kidease.web");
  assert.equal(body.aud, "https://appleid.apple.com");
  assert.equal(body.exp - body.iat, 60 * 60 * 24 * 180);
});

test("iOS native uses the system sheet; web and Android use the redirect", () => {
  assert.equal(appleSignInRoute({ configured: false, native: true, platform: "ios" }), "hidden");
  assert.equal(appleSignInRoute({ configured: true, native: true, platform: "ios" }), "native");
  assert.equal(appleSignInRoute({ configured: true, native: true, platform: "android" }), "web");
  assert.equal(appleSignInRoute({ configured: true, native: false, platform: "web" }), "web");
});

test("Apple gets the hashed nonce and Better Auth gets the raw nonce", async () => {
  const pair = await appleNoncePair();
  assert.notEqual(pair.raw, pair.hashed);
  assert.equal(pair.hashed, await sha256Hex(pair.raw));
  const payload = appleNativeIdToken({
    credential: { identityToken: "header.payload.sig" },
    rawNonce: pair.raw,
  });
  assert.equal(payload.provider, "apple");
  assert.equal(payload.idToken.nonce, pair.raw);
  assert.equal(payload.idToken.token, "header.payload.sig");
});

test("revoke posts refresh then access tokens and skips when Apple is not configured", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: init.body });
    return { ok: url === APPLE_REVOKE_URL };
  };
  const skipped = await revokeAppleSignInTokens({
    clientId: "",
    clientSecret: "",
    refreshToken: "refresh",
    fetchImpl,
  });
  assert.equal(skipped.skipped, true);
  assert.equal(calls.length, 0);
  const done = await revokeAppleSignInTokens({
    clientId: "ca.kidease.web",
    clientSecret: "secret-jwt",
    refreshToken: "refresh-token",
    accessToken: "access-token",
    fetchImpl,
  });
  assert.equal(done.attempted, 2);
  assert.equal(done.ok, 2);
  assert.match(calls[0].body, /token_type_hint=refresh_token/);
  assert.match(calls[1].body, /token_type_hint=access_token/);
  assert.match(appleRevokeForm({
    clientId: "ca.kidease.web",
    clientSecret: "secret-jwt",
    token: "refresh-token",
    tokenTypeHint: "refresh_token",
  }), /client_id=ca\.kidease\.web/);
});

test("native plugin, entitlement, and delete-account revoke are wired", () => {
  assert.match(src("ios/App/App/App.entitlements"), /com\.apple\.developer\.applesignin/);
  assert.match(src("ios/App/App/AppleSignInPlugin.swift"), /request\.nonce/);
  assert.match(src("ios/App/App/KidEaseBridgeViewController.swift"), /registerPluginInstance/);
  assert.match(src("src/lib/auth/client.ts"), /authorizeNativeApple/);
  assert.match(src("src/lib/server/family.ts"), /revokeStoredAppleSignIn/);
  assert.match(src("docs/apple-sign-in.md"), /https:\/\/www\.kidease\.ca\/api\/auth\/callback\/apple/);
  assert.match(src("docs/apple-sign-in.md"), /APPLE_CLIENT_ID/);
  assert.match(src("docs/apple-sign-in.md"), /B7UM5AC9JQ/);
  assert.doesNotMatch(src("docs/apple-sign-in.md"), /BEGIN PRIVATE KEY/);
});
