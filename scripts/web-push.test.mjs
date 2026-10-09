import assert from "node:assert/strict";
import { createECDH, generateKeyPairSync, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { pushArmed } from "../src/lib/channel-readiness.ts";
import { pushCredentialsPresent } from "../src/lib/push.ts";
import { resetRemoteFlagsForTests } from "../src/lib/flags.ts";
import { isAllowedWebPushEndpoint, notificationsPolicyDirective, sitePermissionsPolicy } from "../src/lib/web-push.ts";
import { decryptWebPushPayload, encryptWebPushPayload, vapidKeysMatch, vapidPublicRaw } from "../src/lib/web-push-crypto.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

afterEach(() => {
  resetRemoteFlagsForTests();
});

test("aes128gcm payload round-trips with the subscriber key", () => {
  const subscriber = createECDH("prime256v1");
  subscriber.generateKeys();
  const auth = randomBytes(16).toString("base64url");
  const record = encryptWebPushPayload({
    payload: '{"title":"Spot open","body":"Oaks","url":"/daycare/oaks"}',
    p256dh: subscriber.getPublicKey().toString("base64url"),
    auth,
  });
  assert.equal(
    decryptWebPushPayload(record, subscriber, auth),
    '{"title":"Spot open","body":"Oaks","url":"/daycare/oaks"}',
  );
});

test("a generated VAPID pair matches and a bad private key does not", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = publicKey.export({ format: "jwk" });
  const pub = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(jwk.x, "base64url"),
    Buffer.from(jwk.y, "base64url"),
  ]).toString("base64url");
  const secret = privateKey.export({ format: "jwk" }).d;
  assert.equal(vapidPublicRaw(pub), pub);
  assert.equal(vapidKeysMatch(pub, secret), true);
  assert.equal(vapidKeysMatch(pub, "not-a-key"), false);
});

test("web push endpoints stay on known browser hosts", () => {
  assert.equal(isAllowedWebPushEndpoint("https://fcm.googleapis.com/fcm/send/abc"), true);
  assert.equal(isAllowedWebPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc"), true);
  assert.equal(isAllowedWebPushEndpoint("https://web.push.apple.com/Q"), true);
  assert.equal(isAllowedWebPushEndpoint("https://wns.windows.com/abc"), true);
  assert.equal(isAllowedWebPushEndpoint("https://aa.notify.windows.com/abc"), true);
  assert.equal(isAllowedWebPushEndpoint("https://evil.example/push"), false);
  assert.equal(isAllowedWebPushEndpoint("http://fcm.googleapis.com/x"), false);
  assert.equal(isAllowedWebPushEndpoint("https://user:pass@fcm.googleapis.com/x"), false);
});

test("permissions policy allows a prompt only for this site", () => {
  const vercel = readFileSync(join(root, "vercel.json"), "utf8");
  assert.match(vercel, /notifications=\(self\)/);
  assert.doesNotMatch(vercel, /notifications=\(\)/);
  assert.equal(notificationsPolicyDirective(true), "notifications=(self)");
  assert.match(sitePermissionsPolicy({ notifications: true }), /notifications=\(self\)/);
});

test("production can arm on a VAPID pair without native credentials", () => {
  const env = {
    FEATURE_PUSH: "1",
    VERCEL_ENV: "production",
    VAPID_PUBLIC_KEY: "public-not-real",
    VAPID_PRIVATE_KEY: "private-not-real",
  };
  assert.equal(pushArmed(env), true);
  assert.equal(pushCredentialsPresent(env), false);
  assert.equal(pushArmed({ FEATURE_PUSH: "1", VERCEL_ENV: "production" }), false);
});
