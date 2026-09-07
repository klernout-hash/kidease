import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { pushEnabled } from "../src/lib/features.ts";
import {
  apnsConfigured,
  fcmConfigured,
  isPushToken,
  normalizePushToken,
  parsePushPlatform,
  parsePushProvider,
  PUSH_ENV_NAMES,
  PUSH_SCAFFOLD_MESSAGE,
  pushCredentialsPresent,
  pushEnvPresence,
  pushLive,
} from "../src/lib/push.ts";
import { generateKeyPairSync } from "node:crypto";
import {
  dryRunPushNotification,
  PUSH_DISABLED_MESSAGE,
  PUSH_DRY_RUN_MESSAGE,
  PUSH_WEB_BLOCKED_MESSAGE,
  upsertPushDeviceToken,
  validateRegisterInput,
} from "../src/lib/server/push-tokens.ts";
import {
  apnsHost,
  isInvalidVendorToken,
  pemFromEnv,
  resetPushSendCacheForTests,
  sendPushToDevices,
} from "../src/lib/server/push-send.ts";
import { PUSH_CREDENTIALS_MESSAGE } from "../src/lib/push.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const SAMPLE_TOKEN = "a".repeat(32);
const LIVE_ENV = {
  FEATURE_PUSH: "1",
  FCM_PROJECT_ID: "kidease-not-real",
  FCM_CLIENT_EMAIL: "push@kidease-not-real.iam.gserviceaccount.com",
  FCM_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nNOT_A_REAL_KEY\\n-----END PRIVATE KEY-----\\n",
};

function memorySql(seed = []) {
  const rows = seed.map((row) => ({ ...row }));
  return {
    rows,
    async query(text, params = []) {
      const sql = String(text).toLowerCase();
      if (sql.includes("select id from push_device_tokens where token")) {
        const hit = rows.find((r) => r.token === params[0]);
        return hit ? [{ id: hit.id }] : [];
      }
      if (sql.startsWith("update push_device_tokens")) {
        const row = rows.find((r) => r.id === params[5]);
        if (row) {
          row.user_id = params[0];
          row.platform = params[1];
          row.provider = params[2];
          row.device_id = params[3];
          row.locale = params[4];
        }
        return [];
      }
      if (sql.startsWith("insert into push_device_tokens")) {
        rows.push({
          id: params[0],
          user_id: params[1],
          token: params[2],
          platform: params[3],
          provider: params[4],
          device_id: params[5],
          locale: params[6],
        });
        return [];
      }
      if (sql.startsWith("delete from push_device_tokens")) {
        const idx = rows.findIndex((r) => r.token === params[0]);
        if (idx >= 0) rows.splice(idx, 1);
        return [];
      }
      if (sql.includes("from push_device_tokens where user_id")) {
        return rows.filter((r) => r.user_id === params[0]).map((r) => ({ ...r }));
      }
      if (sql.includes("from push_device_tokens")) {
        return rows.map((r) => ({ ...r }));
      }
      return [];
    },
  };
}

test("FEATURE_PUSH defaults off and absent env is off", () => {
  assert.equal(pushEnabled({}), false);
  assert.equal(pushEnabled({ FEATURE_PUSH: "0" }), false);
  assert.equal(pushEnabled({ FEATURE_PUSH: "" }), false);
  assert.equal(pushEnabled({ FEATURE_PUSH: "1" }), true);
  assert.equal(pushLive({}), false);
  assert.equal(pushLive(LIVE_ENV), true);
  assert.equal(fcmConfigured({}), false);
  assert.equal(apnsConfigured({}), false);
  assert.equal(pushCredentialsPresent({}), false);
  assert.deepEqual(pushEnvPresence({}), { fcm: false, apns: false, vapid: false, credentialsPresent: false });
});

test("token and platform validation rejects web and junk", () => {
  assert.equal(isPushToken("short"), false);
  assert.equal(isPushToken(SAMPLE_TOKEN), true);
  assert.equal(normalizePushToken(`  ${SAMPLE_TOKEN}  `), SAMPLE_TOKEN);
  assert.equal(parsePushPlatform("web"), null);
  assert.equal(parsePushPlatform("ios"), "ios");
  assert.equal(parsePushProvider("", "ios"), "apns");
  assert.equal(parsePushProvider("", "android"), "fcm");
  assert.equal(validateRegisterInput({ token: SAMPLE_TOKEN, platform: "web" }).ok, false);
  assert.equal(validateRegisterInput({ token: SAMPLE_TOKEN, platform: "web" }).error, PUSH_WEB_BLOCKED_MESSAGE);
  assert.equal(validateRegisterInput({ token: SAMPLE_TOKEN, platform: "ios" }).ok, true);
  assert.equal(validateRegisterInput({ token: SAMPLE_TOKEN, platform: "ios" }).data.provider, "apns");
});

test("register refuses to persist when FEATURE_PUSH is off", async () => {
  const sql = memorySql();
  const result = await upsertPushDeviceToken(
    sql,
    "user_1",
    { token: SAMPLE_TOKEN, platform: "ios" },
    { FEATURE_PUSH: "0" },
  );
  assert.deepEqual(result, { ok: false, skipped: true, error: PUSH_DISABLED_MESSAGE });
  assert.equal(sql.rows.length, 0);
});

test("register upserts a native token when the flag is on", async () => {
  const sql = memorySql();
  const first = await upsertPushDeviceToken(
    sql,
    "user_1",
    { token: SAMPLE_TOKEN, platform: "android" },
    { FEATURE_PUSH: "1" },
  );
  assert.equal(first.ok, true);
  assert.equal(first.created, true);
  assert.equal(sql.rows[0].user_id, "user_1");
  assert.equal(sql.rows[0].provider, "fcm");

  const second = await upsertPushDeviceToken(
    sql,
    "user_2",
    { token: SAMPLE_TOKEN, platform: "android" },
    { FEATURE_PUSH: "1" },
  );
  assert.equal(second.ok, true);
  assert.equal(second.created, false);
  assert.equal(sql.rows.length, 1);
  assert.equal(sql.rows[0].user_id, "user_2");
});

test("dry-run counts tokens and never marks ok", async () => {
  const sql = memorySql([
    { id: "pt_1", user_id: "user_1", token: SAMPLE_TOKEN, platform: "ios", provider: "apns" },
    { id: "pt_2", user_id: "user_1", token: "b".repeat(32), platform: "android", provider: "fcm" },
  ]);
  const off = await dryRunPushNotification({ title: "Vacancy" }, { sql, env: { FEATURE_PUSH: "0" } });
  assert.equal(off.ok, false);
  assert.equal(off.dryRun, true);
  assert.equal(off.tokenCount, 0);
  assert.equal(off.error, PUSH_SCAFFOLD_MESSAGE);

  const on = await dryRunPushNotification({ userId: "user_1", title: "Vacancy" }, { sql, env: { FEATURE_PUSH: "1" } });
  assert.equal(on.ok, false);
  assert.equal(on.dryRun, true);
  assert.equal(on.tokenCount, 2);
  assert.deepEqual(on.platforms, { ios: 1, android: 1 });
  assert.equal(on.error, PUSH_DRY_RUN_MESSAGE);
});

test("docs, migration, API, hook, and plugin are wired but off by default", () => {
  const docs = src("docs/push.md");
  const envExample = src(".env.example");
  const migration = src("migrations/0027_push_device_tokens.sql");
  const register = src("src/routes/api/push.register.ts");
  const dryRun = src("src/routes/api/admin.push-dry-run.ts");
  const hook = src("src/lib/use-push.ts");
  const client = src("src/lib/push-client.ts");
  const boot = src("src/components/native-boot.tsx");
  const cap = src("capacitor.config.ts");
  const pkg = src("package.json");
  const tree = src("src/routeTree.gen.ts");
  const send = src("src/lib/server/push.server.ts");
  const vercel = src("vercel.json");

  assert.match(docs, /FEATURE_PUSH/);
  assert.match(docs, /TestFlight/);
  assert.match(docs, /aps-environment/);
  assert.match(docs, /\.p8/);
  assert.match(docs, /FCM_PROJECT_ID/);
  assert.match(docs, /www\.kidease\.ca does not register/);
  assert.match(docs, /Not OneSignal/);
  assert.match(docs, /OneSignal or another vendor\. Not planned/);

  assert.match(envExample, /FEATURE_PUSH=0/);
  assert.doesNotMatch(envExample, /FCM_PRIVATE_KEY=\S+/);
  assert.doesNotMatch(envExample, /APNS_KEY=\S+/);
  assert.ok(PUSH_ENV_NAMES.includes("FEATURE_PUSH"));

  assert.match(migration, /create table if not exists push_device_tokens/);
  assert.match(migration, /platform in \('ios', 'android'\)/);

  assert.match(register, /createFileRoute\("\/api\/push\/register"\)/);
  assert.match(register, /requireUserId/);
  assert.match(register, /assertSameSiteRequest/);
  assert.match(register, /GET: \(\) => new Response\("Method Not Allowed", \{ status: 405 \}\)/);
  assert.match(register, /Unauthorized/);
  assert.match(register, /\? 401/);
  assert.match(dryRun, /createFileRoute\("\/api\/admin\/push-dry-run"\)/);
  assert.match(dryRun, /requireAdmin/);
  assert.match(dryRun, /assertSameSiteRequest/);
  assert.match(src("src/lib/server/push-api.ts"), /authMiddleware/);
  assert.match(src("src/lib/server/push-api.ts"), /registerPushToken/);
  assert.match(src("src/lib/server/push-api.ts"), /requireAdmin/);

  assert.match(hook, /usePushRegistration/);
  assert.match(hook, /isNative\(\)/);
  assert.match(hook, /status\.enabled/);
  assert.match(boot, /usePushRegistration/);

  assert.match(client, /registerPushDevice/);
  assert.match(client, /@capacitor\/push-notifications/);
  assert.match(client, /enabled !== true/);
  assert.match(cap, /PushNotifications/);
  assert.match(pkg, /"@capacitor\/push-notifications"/);

  assert.match(tree, /\/api\/push\/register/);
  assert.match(tree, /\/api\/admin\/push-dry-run/);
  assert.match(send, /PUSH_SCAFFOLD_MESSAGE/);
  assert.doesNotMatch(send, /fcm\.googleapis\.com|api\.push\.apple\.com/);
  assert.match(src("src/lib/server/push-send.ts"), /fcm\.googleapis\.com\/v1\/projects/);
  assert.match(src("src/lib/server/push-send.ts"), /api\.push\.apple\.com/);
  assert.match(src("src/lib/server/push-send.ts"), /FEATURE_PUSH/);
  assert.match(vercel, /notifications=\(\)/);
  assert.match(docs, /Leave `FEATURE_PUSH` unset/);
  assert.match(envExample, /FEATURE_SMS=0/);
  assert.doesNotMatch(envExample, /FEATURE_PUSH=1/);
});

test("register and admin dry-run HTTP gates reject anonymous callers", () => {
  const register = src("src/routes/api/push.register.ts");
  const dryRun = src("src/routes/api/admin.push-dry-run.ts");
  const api = src("src/lib/server/push-api.ts");
  assert.match(register, /const userId = await requireUserId\(\)/);
  assert.match(register, /upsertPushDeviceToken\(sql, userId/);
  assert.ok(register.indexOf("requireUserId") < register.indexOf("upsertPushDeviceToken"));
  assert.match(dryRun, /await requireAdminCaller\(\)/);
  assert.ok(dryRun.indexOf("requireAdminCaller") < dryRun.indexOf("dryRunPushNotification"));
  assert.match(api, /\.middleware\(\[authMiddleware\]\)/);
  assert.match(api, /await requireAdmin\(context\.userId\)/);
});

function generatedVendorEnv() {
  const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const ec = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return {
    FEATURE_PUSH: "1",
    FCM_PROJECT_ID: "kidease-not-real",
    FCM_CLIENT_EMAIL: "push@kidease-not-real.iam.gserviceaccount.com",
    FCM_PRIVATE_KEY: rsa.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    APNS_KEY_ID: "ABCDE12345",
    APNS_TEAM_ID: "TEAMID1234",
    APNS_BUNDLE_ID: "ca.daycarenearme.app",
    APNS_KEY: ec.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

test("sendPushToDevices no-ops when the flag is off or credentials are missing", async () => {
  resetPushSendCacheForTests();
  let called = 0;
  const fetchImpl = async () => {
    called += 1;
    throw new Error("should not fetch");
  };
  const tokens = [
    { id: "pt_1", token: SAMPLE_TOKEN, platform: "android", provider: "fcm" },
  ];
  const off = await sendPushToDevices(
    { title: "Vacancy", body: "2 toddler spots", tokens },
    { env: { FEATURE_PUSH: "0" }, fetchImpl },
  );
  assert.deepEqual(off, { ok: false, skipped: true, error: PUSH_SCAFFOLD_MESSAGE });
  const missing = await sendPushToDevices(
    { title: "Vacancy", body: "2 toddler spots", tokens },
    { env: { FEATURE_PUSH: "1" }, fetchImpl },
  );
  assert.deepEqual(missing, { ok: false, skipped: true, error: PUSH_CREDENTIALS_MESSAGE });
  assert.equal(called, 0);
});

test("sendPushToDevices posts FCM HTTP v1 and APNs without leaking secrets", async () => {
  resetPushSendCacheForTests();
  const env = generatedVendorEnv();
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("oauth2.googleapis.com")) {
      return new Response(JSON.stringify({ access_token: "ya29.not-real", expires_in: 3600 }), { status: 200 });
    }
    return new Response(JSON.stringify({ name: "projects/kidease-not-real/messages/1" }), { status: 200 });
  };
  const apnsCalls = [];
  const apnsRequest = async (input) => {
    apnsCalls.push(input);
    return { status: 200, body: "" };
  };
  const result = await sendPushToDevices(
    {
      title: "Vacancy",
      body: "2 toddler spots at a centre",
      tokens: [
        { id: "pt_a", token: "fcm-token-android-device-001", platform: "android", provider: "fcm" },
        { id: "pt_i", token: "apns-token-ios-device-000001", platform: "ios", provider: "apns" },
      ],
    },
    { env, fetchImpl, apnsRequest, nowSec: 1_700_000_000 },
  );
  assert.equal(result.ok, true);
  assert.equal(result.sent, 2);
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /oauth2\.googleapis\.com\/token/);
  assert.match(calls[1].url, /fcm\.googleapis\.com\/v1\/projects\/kidease-not-real\/messages:send/);
  assert.match(String(calls[1].init.headers.Authorization), /^Bearer ya29/);
  assert.doesNotMatch(JSON.stringify(calls), /BEGIN PRIVATE KEY/);
  assert.doesNotMatch(JSON.stringify(apnsCalls), /BEGIN PRIVATE KEY/);
  assert.equal(apnsCalls.length, 1);
  assert.equal(apnsCalls[0].host, "api.sandbox.push.apple.com");
  assert.equal(apnsCalls[0].path, "/3/device/apns-token-ios-device-000001");
  assert.match(apnsCalls[0].headers.authorization, /^bearer /);
  assert.equal(apnsCalls[0].headers["apns-topic"], "ca.daycarenearme.app");
});

test("invalid vendor tokens are deleted and APNs production host is gated", async () => {
  resetPushSendCacheForTests();
  const env = generatedVendorEnv();
  const sql = memorySql([
    { id: "pt_dead", user_id: "user_1", token: "dead-fcm-token-should-go", platform: "android", provider: "fcm" },
  ]);
  const fetchImpl = async (url) => {
    if (String(url).includes("oauth2.googleapis.com")) {
      return new Response(JSON.stringify({ access_token: "ya29.not-real", expires_in: 3600 }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }), {
      status: 404,
    });
  };
  const result = await sendPushToDevices(
    {
      title: "Vacancy",
      body: "spot opened",
      tokens: [{ id: "pt_dead", token: "dead-fcm-token-should-go", platform: "android", provider: "fcm" }],
    },
    { env, fetchImpl, sql },
  );
  assert.equal(result.ok, true);
  assert.equal(result.failed, 1);
  assert.deepEqual(result.invalidTokens, ["dead-fcm-token-should-go"]);
  assert.equal(sql.rows.length, 0);
  assert.equal(apnsHost({}), "api.sandbox.push.apple.com");
  assert.equal(apnsHost({ APNS_PRODUCTION: "1" }), "api.push.apple.com");
  assert.equal(
    isInvalidVendorToken({ provider: "apns", status: 410, body: '{"reason":"Unregistered"}' }),
    true,
  );
  assert.match(pemFromEnv('"-----BEGIN PRIVATE KEY-----\\nX\\n-----END PRIVATE KEY-----\\n"'), /BEGIN PRIVATE KEY/);
});
