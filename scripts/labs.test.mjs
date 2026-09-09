import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  canSeeProviderSubscriptions,
  envFlagOn,
  inAppChatEnabled,
  providerSubscriptionsEnabled,
  pushEnabled,
  smsEnabled,
  videoEnabled,
} from "../src/lib/features.ts";
import {
  CHAT_SCAFFOLD_READY,
  chatComposerState,
  refuseScaffoldChatSend,
} from "../src/lib/chat-scaffold.ts";
import { FEATURE_FLAG_CATALOG, FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { FCM_LAB_NEXT_STEPS } from "../src/lib/push.ts";
import { TWILIO_VIDEO_LAB_NEXT_STEPS, VIDEO_SDK_WIRED } from "../src/lib/video.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("feature flags default off and only accept explicit on values", () => {
  assert.equal(envFlagOn(undefined), false);
  assert.equal(envFlagOn("0"), false);
  assert.equal(envFlagOn("false"), false);
  assert.equal(inAppChatEnabled({}), false);
  assert.equal(inAppChatEnabled({ FEATURE_INAPP_CHAT: "1" }), true);
  assert.equal(pushEnabled({}), false);
  assert.equal(pushEnabled({ FEATURE_PUSH: "true" }), true);
  assert.equal(smsEnabled({}), false);
  assert.equal(smsEnabled({ FEATURE_SMS: "1" }), true);
  assert.equal(videoEnabled({}), false);
  assert.equal(videoEnabled({ FEATURE_VIDEO: "1" }), true);
  assert.equal(providerSubscriptionsEnabled({}), true);
  assert.equal(providerSubscriptionsEnabled({ FEATURE_PROVIDER_SUBSCRIPTIONS: "1" }), true);
  assert.equal(providerSubscriptionsEnabled({ FEATURE_PROVIDER_SUBSCRIPTIONS: "0" }), false);
  assert.equal(canSeeProviderSubscriptions("admin", {}), true);
  assert.equal(canSeeProviderSubscriptions("admin", { FEATURE_PROVIDER_SUBSCRIPTIONS: "0" }), true);
  assert.equal(canSeeProviderSubscriptions("provider", {}), true);
  assert.equal(canSeeProviderSubscriptions("provider", { FEATURE_PROVIDER_SUBSCRIPTIONS: "0" }), false);
  assert.equal(canSeeProviderSubscriptions("provider", {}, true), true);
  assert.equal(canSeeProviderSubscriptions("parent", {}, true), true);
  assert.equal(canSeeProviderSubscriptions("parent", { FEATURE_PROVIDER_SUBSCRIPTIONS: "1" }), false);
  assert.equal(CHAT_SCAFFOLD_READY, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_PUSH, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_VIDEO, false);
  assert.equal(VIDEO_SDK_WIRED, false);
  const off = chatComposerState(false);
  const on = chatComposerState(true);
  assert.equal(off.disabled, true);
  assert.equal(off.enabled, false);
  assert.equal(off.reason, "feature_off");
  assert.match(off.message, /FEATURE_INAPP_CHAT is off/);
  assert.equal(on.disabled, true);
  assert.equal(on.enabled, false);
  assert.equal(on.reason, "scaffold_not_ready");
  const refused = refuseScaffoldChatSend({ threadId: "t1", body: "hi" });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /does not send/i);
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
    "APNS_PRODUCTION",
    "VITE_FCM_VAPID_PUBLIC_KEY",
  ]) {
    assert.match(envExample, new RegExp(`${name}=`));
  }
  assert.doesNotMatch(envExample, /FCM_PRIVATE_KEY=\S+/);
  assert.doesNotMatch(envExample, /APNS_KEY=\S+/);
  assert.match(envExample, /^FEATURE_INAPP_CHAT=0$/m);
  assert.match(envExample, /^FEATURE_PUSH=0$/m);
  assert.match(envExample, /FEATURE_PROVIDER_SUBSCRIPTIONS=1/);
  assert.match(envExample, /^FEATURE_SMS=0$/m);
  assert.match(envExample, /^FEATURE_VIDEO=0$/m);
  assert.doesNotMatch(envExample, /^FEATURE_PUSH=1$/m);
  assert.doesNotMatch(envExample, /^FEATURE_VIDEO=1$/m);
  assert.equal(FCM_LAB_NEXT_STEPS.length, 3);
  assert.equal(TWILIO_VIDEO_LAB_NEXT_STEPS.length, 3);
  assert.equal(
    FEATURE_FLAG_CATALOG.map((row) => row.key).join(","),
    "FEATURE_INAPP_CHAT,FEATURE_PUSH,FEATURE_SMS,FEATURE_VIDEO,FEATURE_PROVIDER_SUBSCRIPTIONS",
  );
  assert.equal(FEATURE_FLAG_CATALOG.find((row) => row.key === "FEATURE_PUSH")?.defaultOn, false);
  assert.equal(FEATURE_FLAG_CATALOG.find((row) => row.key === "FEATURE_VIDEO")?.defaultOn, false);
});

test("admin chat lab is registered, admin-gated, and honest", () => {
  const route = readFileSync(join(root, "src/routes/admin-chat.tsx"), "utf8");
  const tree = readFileSync(join(root, "src/routeTree.gen.ts"), "utf8");
  const send = readFileSync(join(root, "src/lib/server/push.server.ts"), "utf8");
  const client = readFileSync(join(root, "src/lib/push-client.ts"), "utf8");
  assert.match(route, /createFileRoute\("\/admin-chat"\)/);
  assert.match(route, /canVisitDesk\(session\.desks, "admin", session\.role\)/);
  assert.match(route, /CHAT_SCAFFOLD_MESSAGE/);
  assert.match(route, /FEATURE_SMS/);
  assert.match(route, /FEATURE_VIDEO/);
  assert.match(route, /Programmable SMS/);
  assert.match(route, /Production blocked|Preview override|channelState/);
  assert.match(route, /Scaffold/);
  assert.match(route, /Coming soon/);
  assert.match(route, /Chat composer \(disabled\)/);
  assert.match(route, /FEATURE_FLAG_CATALOG/);
  assert.match(route, /FCM_LAB_NEXT_STEPS/);
  assert.match(route, /TWILIO_VIDEO_LAB_NEXT_STEPS/);
  assert.match(route, /from "@\/lib\/server\/chat-scaffold"/);
  assert.doesNotMatch(route, /\.server['"]/);
  assert.doesNotMatch(route, /chat-scaffold\.server/);
  assert.match(tree, /from '\.\/routes\/admin-chat'/);
  assert.match(tree, /id:\s*'\/admin-chat'/);
  assert.match(send, /PUSH_SCAFFOLD_MESSAGE/);
  assert.doesNotMatch(send, /fcm\.googleapis\.com|api\.push\.apple\.com/);
  assert.match(readFileSync(join(root, "src/lib/server/push-send.ts"), "utf8"), /fcm\.googleapis\.com/);
  assert.match(client, /registerPushDevice/);
  assert.match(readFileSync(join(root, "docs/push.md"), "utf8"), /FEATURE_PUSH/);
  assert.match(readFileSync(join(root, "docs/flags.md"), "utf8"), /POSTHOG_FLAGS_KEY/);
  assert.match(readFileSync(join(root, "docs/chat.md"), "utf8"), /disabled composer/i);
  assert.match(readFileSync(join(root, "docs/chat.md"), "utf8"), /Production vs Preview/);
  assert.match(route, /docs\/flags\.md/);
  assert.match(route, /docs\/chat\.md/);
  assert.match(readFileSync(join(root, "src/lib/chat-scaffold.ts"), "utf8"), /not Stream, not Sendbird/);
});
