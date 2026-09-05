import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { envFlagOn, inAppChatEnabled, pushEnabled } from "../src/lib/features.ts";
import { CHAT_SCAFFOLD_READY } from "../src/lib/chat-scaffold.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("feature flags default off and only accept explicit on values", () => {
  assert.equal(envFlagOn(undefined), false);
  assert.equal(envFlagOn("0"), false);
  assert.equal(envFlagOn("false"), false);
  assert.equal(inAppChatEnabled({}), false);
  assert.equal(inAppChatEnabled({ FEATURE_INAPP_CHAT: "1" }), true);
  assert.equal(pushEnabled({}), false);
  assert.equal(pushEnabled({ FEATURE_PUSH: "true" }), true);
  assert.equal(CHAT_SCAFFOLD_READY, false);
});

test("push stubs do not invent credentials and env example has names only", () => {
  const push = readFileSync(join(root, "src/lib/push.ts"), "utf8");
  const envExample = readFileSync(join(root, ".env.example"), "utf8");
  assert.match(push, /export const PUSH_ENV_NAMES/);
  assert.match(push, /FCM_PROJECT_ID/);
  assert.match(push, /APNS_KEY_ID/);
  assert.match(push, /VITE_FCM_VAPID_PUBLIC_KEY/);
  assert.match(push, /do not invent keys/i);
  for (const name of [
    "FEATURE_PUSH",
    "FCM_PROJECT_ID",
    "FCM_CLIENT_EMAIL",
    "FCM_PRIVATE_KEY",
    "APNS_KEY_ID",
    "APNS_TEAM_ID",
    "APNS_BUNDLE_ID",
    "APNS_KEY",
    "VITE_FCM_VAPID_PUBLIC_KEY",
  ]) {
    assert.match(envExample, new RegExp(`${name}=`));
  }
  assert.doesNotMatch(envExample, /FCM_PRIVATE_KEY=\S+/);
  assert.doesNotMatch(envExample, /APNS_KEY=\S+/);
  assert.match(envExample, /FEATURE_INAPP_CHAT=0/);
  assert.match(envExample, /FEATURE_PUSH=0/);
});

test("admin chat lab is registered, admin-gated, and honest", () => {
  const route = readFileSync(join(root, "src/routes/admin-chat.tsx"), "utf8");
  const tree = readFileSync(join(root, "src/routeTree.gen.ts"), "utf8");
  const send = readFileSync(join(root, "src/lib/server/push.server.ts"), "utf8");
  const client = readFileSync(join(root, "src/lib/push-client.ts"), "utf8");
  assert.match(route, /createFileRoute\("\/admin-chat"\)/);
  assert.match(route, /desks\.includes\("admin"\)/);
  assert.match(route, /CHAT_SCAFFOLD_MESSAGE/);
  assert.match(route, /Scaffold/);
  assert.match(tree, /from '\.\/routes\/admin-chat'/);
  assert.match(tree, /id:\s*'\/admin-chat'/);
  assert.match(send, /PUSH_SCAFFOLD_MESSAGE/);
  assert.doesNotMatch(send, /fcm\.googleapis\.com|api\.push\.apple\.com/);
  assert.match(client, /registerPushDevice/);
  assert.match(readFileSync(join(root, "src/lib/chat-scaffold.ts"), "utf8"), /not Stream, not Sendbird/);
});
