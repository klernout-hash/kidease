import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "node:test";
import {
  DEFAULT_POSTHOG_FLAGS_HOST,
  FLAG_DEFAULTS,
  POSTHOG_FLAGS_KEY_ENV,
  SERVER_FLAGS_DISTINCT_ID,
  describeFeatureFlag,
  envFlagOn,
  evaluateFeatureFlag,
  fetchPostHogFlags,
  flagsHost,
  parsePostHogFlagsResponse,
  parseRemoteFlagValue,
  refreshRemoteFlags,
  remoteFlagsConfigured,
  resetRemoteFlagsForTests,
  resolveFlag,
  setRemoteFlagCacheForTests,
} from "../src/lib/flags.ts";
import {
  inAppChatEnabled,
  providerSubscriptionsEnabled,
  pushEnabled,
  showPayCtas,
  smsEnabled,
  videoEnabled,
} from "../src/lib/features.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

afterEach(() => {
  resetRemoteFlagsForTests();
});

test("FEATURE_PUSH and FEATURE_SMS default off; subscriptions default on", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_PUSH, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_SMS, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_VIDEO, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_INAPP_CHAT, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_PROVIDER_SUBSCRIPTIONS, true);
  assert.equal(FLAG_DEFAULTS.SHOW_PAY_CTAS, false);
  assert.equal(envFlagOn(undefined), false);
  assert.equal(smsEnabled({}), false);
  assert.equal(pushEnabled({}), false);
  assert.equal(videoEnabled({}), false);
  assert.equal(inAppChatEnabled({}), false);
  assert.equal(providerSubscriptionsEnabled({}), true);
  assert.equal(showPayCtas({}), false);
  assert.equal(showPayCtas({ SHOW_PAY_CTAS: "0" }), false);
  assert.equal(showPayCtas({ SHOW_PAY_CTAS: "1" }), true);
});

test("custom env objects stay env-only and ignore the process overlay", () => {
  setRemoteFlagCacheForTests({ FEATURE_SMS: true, FEATURE_PUSH: true });
  assert.equal(smsEnabled({ FEATURE_SMS: "0" }), false);
  assert.equal(smsEnabled({ FEATURE_SMS: "1" }), true);
  assert.equal(pushEnabled({}), false);
  assert.equal(evaluateFeatureFlag("FEATURE_SMS", { FEATURE_SMS: "0" }, { remote: { FEATURE_SMS: true } }), true);
  assert.equal(evaluateFeatureFlag("FEATURE_SMS", { FEATURE_SMS: "1" }, { remote: { FEATURE_SMS: false } }), false);
  assert.equal(evaluateFeatureFlag("FEATURE_SMS", { FEATURE_SMS: "0" }, { remote: {} }), false);
});

test("resolveFlag uses remote when present, else env, else default", () => {
  assert.deepEqual(resolveFlag({ envRaw: "0", remoteValue: true }), { enabled: true, source: "remote" });
  assert.deepEqual(resolveFlag({ envRaw: "1", remoteValue: false }), { enabled: false, source: "remote" });
  assert.deepEqual(resolveFlag({ envRaw: "1", remoteValue: null }), { enabled: true, source: "env" });
  assert.deepEqual(resolveFlag({ envRaw: "", defaultWhenUnset: true }), { enabled: true, source: "default" });
  assert.deepEqual(resolveFlag({ envRaw: undefined, defaultWhenUnset: false }), { enabled: false, source: "default" });
});

test("unknown PostHog keys are ignored so env behavior is unchanged", () => {
  const parsed = parsePostHogFlagsResponse({
    featureFlags: {
      FEATURE_SMS: true,
      some_other_flag: true,
      FEATURE_PUSH: false,
    },
  });
  assert.deepEqual(parsed, { FEATURE_SMS: true, FEATURE_PUSH: false });
  assert.equal(parseRemoteFlagValue("control"), true);
  assert.equal(parseRemoteFlagValue("false"), false);
  assert.equal(parseRemoteFlagValue(1), true);
});

test("PostHog fetch is skipped without a key and does not invent credentials", async () => {
  assert.equal(POSTHOG_FLAGS_KEY_ENV, "POSTHOG_FLAGS_KEY");
  assert.equal(DEFAULT_POSTHOG_FLAGS_HOST, "https://us.i.posthog.com");
  assert.equal(SERVER_FLAGS_DISTINCT_ID, "kidease-server");
  assert.equal(remoteFlagsConfigured({}), false);
  assert.equal(flagsHost({}), DEFAULT_POSTHOG_FLAGS_HOST);
  let called = 0;
  const snap = await refreshRemoteFlags(
    {},
    async () => {
      called += 1;
      throw new Error("should not fetch");
    },
  );
  assert.equal(called, 0);
  assert.equal(snap.provider, "none");
  assert.equal(snap.ok, true);
  assert.deepEqual(snap.flags, {});
});

test("PostHog fetch parses /flags and degrades to env on HTTP failure", async () => {
  const flags = await fetchPostHogFlags({
    apiKey: "phc_test_not_real",
    fetchImpl: async (url, init) => {
      assert.match(String(url), /\/flags\?v=2$/);
      assert.equal(init.method, "POST");
      const body = JSON.parse(init.body);
      assert.equal(body.distinct_id, SERVER_FLAGS_DISTINCT_ID);
      assert.equal(body.api_key, "phc_test_not_real");
      return new Response(JSON.stringify({ featureFlags: { FEATURE_VIDEO: true } }), { status: 200 });
    },
  });
  assert.deepEqual(flags, { FEATURE_VIDEO: true });

  const failed = await refreshRemoteFlags(
    { POSTHOG_FLAGS_KEY: "phc_test_not_real", FEATURE_SMS: "0" },
    async () => new Response("nope", { status: 503 }),
  );
  assert.equal(failed.ok, false);
  assert.equal(failed.provider, "posthog");
  assert.equal(evaluateFeatureFlag("FEATURE_SMS", { FEATURE_SMS: "0" }, { remote: failed.flags }), false);
});

test("describeFeatureFlag reports source without leaking keys", () => {
  const envOnly = describeFeatureFlag("FEATURE_SMS", { FEATURE_SMS: "0" });
  assert.equal(envOnly.enabled, false);
  assert.equal(envOnly.source, "env");
  assert.equal(envOnly.remoteConfigured, false);
  const remoteOn = describeFeatureFlag("FEATURE_SMS", { FEATURE_SMS: "0" }, { remote: { FEATURE_SMS: true } });
  assert.equal(remoteOn.enabled, true);
  assert.equal(remoteOn.source, "remote");
  assert.equal(remoteOn.envEnabled, false);
});

test("docs and env example stay placeholders; SMS and push stay off", () => {
  const flags = readFileSync(join(root, "src/lib/flags.ts"), "utf8");
  const envExample = readFileSync(join(root, ".env.example"), "utf8");
  const docs = readFileSync(join(root, "docs/flags.md"), "utf8");
  const vite = readFileSync(join(root, "vite.config.ts"), "utf8");
  assert.match(docs, /How Kyle flips a flag/);
  assert.match(docs, /POSTHOG_FLAGS_KEY/);
  assert.match(docs, /Production vs Preview/);
  assert.match(docs, /channel-readiness/);
  assert.match(docs, /FEATURE_SMS/);
  assert.match(docs, /FEATURE_PUSH/);
  assert.match(docs, /SHOW_PAY_CTAS/);
  assert.match(envExample, /# POSTHOG_FLAGS_KEY=/);
  assert.match(envExample, /# POSTHOG_FLAGS_HOST=/);
  assert.match(envExample, /^FEATURE_PUSH=0$/m);
  assert.match(envExample, /^FEATURE_SMS=0$/m);
  assert.match(envExample, /^FEATURE_VIDEO=0$/m);
  assert.match(envExample, /^FEATURE_INAPP_CHAT=0$/m);
  assert.match(envExample, /^SHOW_PAY_CTAS=0$/m);
  assert.doesNotMatch(envExample, /^FEATURE_PUSH=1$/m);
  assert.doesNotMatch(envExample, /^FEATURE_SMS=1$/m);
  assert.doesNotMatch(envExample, /^FEATURE_VIDEO=1$/m);
  assert.match(flags, /FEATURE_FLAG_CATALOG/);
  assert.match(docs, /docs\/chat\.md/);
  assert.doesNotMatch(envExample, /phc_/);
  assert.doesNotMatch(flags, /phc_[A-Za-z0-9]+/);
  assert.doesNotMatch(flags, /POSTHOG_PERSONAL/);
  assert.doesNotMatch(vite, /POSTHOG_FLAGS_KEY/);
  assert.match(vite, /envPrefix: \["VITE_", "POSTHOG_HOST"\]/);
  assert.match(readFileSync(join(root, "src/lib/server/sms.ts"), "utf8"), /evaluateFeatureFlag\("FEATURE_SMS"/);
  assert.match(readFileSync(join(root, "src/lib/server/push-send.ts"), "utf8"), /evaluateFeatureFlag\("FEATURE_PUSH"/);
  assert.match(readFileSync(join(root, "src/lib/server/video.ts"), "utf8"), /evaluateFeatureFlag\("FEATURE_VIDEO"/);
  assert.match(readFileSync(join(root, "src/routes/admin-chat.tsx"), "utf8"), /docs\/flags\.md/);
});
