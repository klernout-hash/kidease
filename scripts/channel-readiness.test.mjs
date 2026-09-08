import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "node:test";
import {
  describeChannelReadiness,
  isVercelProduction,
  listChannelReadiness,
  pushArmed,
  smsArmed,
  smsSendEnabled,
  videoArmed,
  videoSurfaceEnabled,
} from "../src/lib/channel-readiness.ts";
import { VIDEO_SDK_WIRED } from "../src/lib/video.ts";
import { resetRemoteFlagsForTests } from "../src/lib/flags.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const SMS_LIVE = {
  FEATURE_SMS: "1",
  TWILIO_ACCOUNT_SID: "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  TWILIO_AUTH_TOKEN: "test_auth_token_not_real",
  TWILIO_FROM_NUMBER: "+12045550100",
};

const PUSH_LIVE = {
  FEATURE_PUSH: "1",
  FCM_PROJECT_ID: "kidease-not-real",
  FCM_CLIENT_EMAIL: "push@kidease-not-real.iam.gserviceaccount.com",
  FCM_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nnot-real\n-----END PRIVATE KEY-----",
};

const VIDEO_LIVE = {
  FEATURE_VIDEO: "1",
  TWILIO_ACCOUNT_SID: "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  TWILIO_API_KEY_SID: "SKbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  TWILIO_API_KEY_SECRET: "api_key_secret_not_real",
};

afterEach(() => {
  resetRemoteFlagsForTests();
});

test("Production ignores FEATURE_* without secrets; Preview may override", () => {
  assert.equal(isVercelProduction({}), false);
  assert.equal(isVercelProduction({ VERCEL_ENV: "preview" }), false);
  assert.equal(isVercelProduction({ VERCEL_ENV: "development" }), false);
  assert.equal(isVercelProduction({ VERCEL_ENV: "production" }), true);

  assert.equal(smsArmed({ FEATURE_SMS: "1" }), true);
  assert.equal(smsArmed({ FEATURE_SMS: "1", VERCEL_ENV: "preview" }), true);
  assert.equal(smsArmed({ FEATURE_SMS: "1", VERCEL_ENV: "production" }), false);
  assert.equal(smsArmed({ ...SMS_LIVE, VERCEL_ENV: "production" }), true);
  assert.equal(smsSendEnabled({ FEATURE_SMS: "1", VERCEL_ENV: "preview" }), false);
  assert.equal(smsSendEnabled({ ...SMS_LIVE, VERCEL_ENV: "production" }), true);

  assert.equal(pushArmed({ FEATURE_PUSH: "1" }), true);
  assert.equal(pushArmed({ FEATURE_PUSH: "1", VERCEL_ENV: "production" }), false);
  assert.equal(pushArmed({ ...PUSH_LIVE, VERCEL_ENV: "production" }), true);

  assert.equal(videoArmed({ FEATURE_VIDEO: "1" }), true);
  assert.equal(videoArmed({ FEATURE_VIDEO: "1", VERCEL_ENV: "production" }), false);
  assert.equal(videoArmed({ ...VIDEO_LIVE, VERCEL_ENV: "production" }), true);
});

test("Video inbox surface stays off until the Twilio Video SDK is wired", () => {
  assert.equal(VIDEO_SDK_WIRED, false);
  assert.equal(videoSurfaceEnabled({ ...VIDEO_LIVE }), false);
  assert.equal(videoSurfaceEnabled({ ...VIDEO_LIVE, VERCEL_ENV: "production" }), false);
  const ready = describeChannelReadiness("video", VIDEO_LIVE);
  assert.equal(ready.flagOn, true);
  assert.equal(ready.sendEnabled, true);
  assert.equal(ready.surfaceEnabled, false);
  assert.equal(ready.reason, "sdk_not_wired");
});

test("defaults stay off and inventory lists all three channels", () => {
  const listed = listChannelReadiness({});
  assert.deepEqual(
    listed.map((row) => row.flagKey),
    ["FEATURE_SMS", "FEATURE_PUSH", "FEATURE_VIDEO"],
  );
  for (const row of listed) {
    assert.equal(row.flagOn, false);
    assert.equal(row.armed, false);
    assert.equal(row.sendEnabled, false);
    assert.equal(row.surfaceEnabled, false);
    assert.equal(row.reason, "flag_off");
  }
});

test("docs, env example, and lab stay Production-safe", () => {
  const docs = readFileSync(join(root, "docs/flags.md"), "utf8");
  const envExample = readFileSync(join(root, ".env.example"), "utf8");
  const smsDocs = readFileSync(join(root, "docs/sms.md"), "utf8");
  const inbox = readFileSync(join(root, "src/routes/inbox.$id.tsx"), "utf8");
  const lab = readFileSync(join(root, "src/lib/server/chat-scaffold.ts"), "utf8");
  const tokens = readFileSync(join(root, "src/lib/server/push-tokens.ts"), "utf8");
  assert.match(docs, /Production vs Preview/);
  assert.match(docs, /channel-readiness/);
  assert.match(docs, /FEATURE_SMS/);
  assert.match(docs, /FEATURE_PUSH/);
  assert.match(docs, /FEATURE_VIDEO/);
  assert.match(envExample, /Production: leave 0 unless/);
  assert.match(envExample, /^FEATURE_SMS=0$/m);
  assert.match(envExample, /^FEATURE_PUSH=0$/m);
  assert.match(envExample, /^FEATURE_VIDEO=0$/m);
  assert.doesNotMatch(envExample, /^FEATURE_SMS=1$/m);
  assert.doesNotMatch(envExample, /^FEATURE_PUSH=1$/m);
  assert.doesNotMatch(envExample, /^FEATURE_VIDEO=1$/m);
  assert.match(smsDocs, /Programmable SMS/);
  assert.match(smsDocs, /not Twilio Verify/);
  assert.match(inbox, /videoSurfaceEnabled/);
  assert.match(lab, /describeChannelReadiness/);
  assert.match(tokens, /pushArmed/);
});
