import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { authMutationAction } from "../src/lib/view-as.ts";
import { PLAY_SHA256_CERT_FINGERPRINTS } from "./well-known-app-links.mjs";
import {
  PASSKEY_ANDROID_PACKAGE,
  PASSKEY_RATE_MAX,
  PASSKEY_RP_ID,
  PASSKEY_WEB_ORIGINS,
  androidApkKeyHashOrigin,
  cleanDeviceName,
  passkeyExpectedOrigins,
  passkeyRateLimited,
  passkeySatisfiesAdminEmailStep,
  sha256FingerprintToApkKeyHash,
} from "../src/lib/passkey-policy.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("passkey origins use kidease.ca and both Android certs", () => {
  assert.equal(PASSKEY_RP_ID, "kidease.ca");
  assert.equal(PASSKEY_ANDROID_PACKAGE, "ca.kidease.app");
  const origins = passkeyExpectedOrigins({
    production: true,
    fingerprints: PLAY_SHA256_CERT_FINGERPRINTS,
  });
  assert.deepEqual(origins.slice(0, 2), [...PASSKEY_WEB_ORIGINS]);
  assert.equal(origins.length, 4);
  for (const fingerprint of PLAY_SHA256_CERT_FINGERPRINTS) {
    const hash = sha256FingerprintToApkKeyHash(fingerprint);
    assert.equal(hash.length, 43);
    assert.match(hash, /^[A-Za-z0-9_-]+$/);
    assert.ok(origins.includes(androidApkKeyHashOrigin(hash)));
  }
  assert.equal(sha256FingerprintToApkKeyHash("not-a-cert"), null);
  const local = passkeyExpectedOrigins({ production: false, fingerprints: [] });
  assert.ok(local.includes("http://localhost:8080"));
  assert.equal(
    passkeyExpectedOrigins({ production: true, fingerprints: [] }).some((origin) => origin.startsWith("http://localhost")),
    false,
  );
});

test("a verified passkey can skip the admin email code", () => {
  assert.equal(passkeySatisfiesAdminEmailStep(true), true);
  assert.equal(passkeySatisfiesAdminEmailStep(false), false);
  assert.equal(passkeyRateLimited(PASSKEY_RATE_MAX - 1), false);
  assert.equal(passkeyRateLimited(PASSKEY_RATE_MAX), true);
  assert.equal(cleanDeviceName("  Kitchen iPad\n"), "Kitchen iPad");
  assert.equal(cleanDeviceName(""), "This device");
  assert.equal(cleanDeviceName("x".repeat(200)).length, 80);
});

test("login, settings, and Android fallback are wired", () => {
  const login = read("src/routes/login.tsx");
  assert.match(login, /data-ke="passkey-sign-in"/);
  assert.match(login, /data-ke="email-primary"/);
  assert.match(login, /username webauthn/);
  assert.match(login, /PasskeyOffer/);
  assert.match(read("src/components/account-security.tsx"), /PasskeySettings/);
  const account = read("src/routes/account.tsx");
  assert.match(account, /chrome\.signedIn && !chrome\.pending/);
  assert.match(account, /section === "security" && \(user \|\| \(chrome\.signedIn && !chrome\.pending\)\)/);
  assert.match(read("src/lib/copy.ts"), /passkeySignIn: "Sign in with Face ID \/ fingerprint"/);
  assert.match(read("src/lib/copy.ts"), /passkeySignIn: "Connexion avec Face ID \/ empreinte"/);
  const plugin = read("src/lib/auth/passkey-plugin.ts");
  assert.match(plugin, /requireUserVerification: true/);
  assert.match(plugin, /passkeySatisfiesAdminEmailStep/);
  assert.match(plugin, /TWO_FACTOR_COOKIE/);
  assert.match(read("src/lib/auth/server.ts"), /passkeyPlugin\(\)/);
  assert.match(read("migrations/0092_passkeys.sql"), /passkey_credentials/);
  assert.match(read("migrations/0092_passkeys.sql"), /public_key/);
  assert.match(read("migrations/0092_passkeys.sql"), /passkey_challenges/);
  assert.equal(authMutationAction("POST", "/api/auth/passkey/register/verify"), "two_factor");
  assert.equal(authMutationAction("POST", "/api/auth/passkey/delete"), "two_factor");
  assert.equal(authMutationAction("POST", "/api/auth/passkey/login/verify"), null);
  const activity = read("android/app/src/main/java/ca/kidease/app/MainActivity.java");
  assert.match(activity, /registerPlugin\(PasskeyPlugin\.class\)/);
  assert.match(activity, /WEB_AUTHENTICATION_SUPPORT_FOR_APP/);
  assert.match(read("android/app/src/main/java/ca/kidease/app/PasskeyPlugin.java"), /CredentialManager/);
  const gradle = read("android/app/build.gradle");
  assert.match(gradle, /credentials-play-services-auth/);
  assert.match(gradle, /playImplementation "androidx\.credentials:credentials-play-services-auth/);
  assert.doesNotMatch(gradle, /huaweiImplementation "androidx\.credentials:credentials-play-services-auth/);
  assert.match(read("docs/passkeys.md"), /APPLE_TEAM_ID/);
  assert.match(read("docs/passkeys.md"), /webcredentials/);
  assert.doesNotMatch(read("src/lib/native-entitlements.ts"), /passkey/);
});
