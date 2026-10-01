import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  FEATURE_SWITCHES,
  aiFeatureKeys,
  allowFeatureWrite,
  auditValue,
  featureFlagWriteBody,
  featureFlagsUrl,
  featureStatusKind,
  isAllowedFeatureKey,
  normalizeFeatureWrite,
  parseFlagStats,
  personalApiKey,
  responseLeaksKey,
  statusFromFlag,
} from "../src/lib/admin-features.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path) => readFileSync(join(root, path), "utf8");

test("the features page only changes the allow-list", () => {
  assert.equal(FEATURE_SWITCHES.length, 14);
  assert.equal(isAllowedFeatureKey("smart-match"), true);
  assert.equal(isAllowedFeatureKey("ai-demand-map"), true);
  assert.equal(isAllowedFeatureKey("parent-helper"), true);
  assert.equal(isAllowedFeatureKey("ranking-best-match"), true);
  assert.equal(isAllowedFeatureKey("some-other-flag"), false);
  assert.equal(aiFeatureKeys().includes("ranking-best-match"), false);
  assert.equal(aiFeatureKeys().length, 13);
  assert.equal(normalizeFeatureWrite(15), null);
  assert.deepEqual(normalizeFeatureWrite(0), { active: false, rollout: 0 });
  assert.deepEqual(featureFlagWriteBody({ active: true, rollout: 25 }), {
    active: true,
    filters: { groups: [{ properties: [], rollout_percentage: 25 }] },
  });
  assert.equal(featureFlagWriteBody({ active: false, rollout: 100 }).active, false);
  assert.match(featureFlagsUrl(), /\/api\/projects\/594559\/feature_flags\//);
});

test("a missing personal key stays read-only and never rides along in the page", () => {
  assert.equal(personalApiKey({}), null);
  assert.equal(personalApiKey({ POSTHOG_PERSONAL_API_KEY: "  " }), null);
  const secret = "phx_test_not_a_real_key";
  assert.equal(personalApiKey({ POSTHOG_PERSONAL_API_KEY: secret }), secret);
  const page = { mode: "readonly", reason: "key-not-set", cards: [] };
  assert.equal(responseLeaksKey(page, secret), false);
  assert.equal(responseLeaksKey({ note: secret }, secret), true);
  assert.equal(featureStatusKind({ active: false, rollout: 0, known: false }), "unknown");
  assert.equal(featureStatusKind({ active: true, rollout: 100, known: true }), "everyone");
  assert.equal(featureStatusKind({ active: true, rollout: 10, known: true }), "percent");
  assert.equal(statusFromFlag(null).inPostHog, false);
  const server = source("src/lib/server/admin-features.ts");
  assert.match(server, /key-not-set/);
  assert.doesNotMatch(server, /console\.(log|info|debug|error)\([^)]*POSTHOG_PERSONAL_API_KEY/);
  assert.match(source("src/routes/admin.features.tsx"), /beforeLoadAdminDesk/);
  assert.match(source("src/routes/admin.features.tsx"), /data-ke="feature-card"/);
  assert.match(source("src/routes/admin.tsx"), /\/admin\/features/);
});

test("audit values, rate limit, and day stats stay on the allow-list", () => {
  assert.equal(auditValue({ active: false, rollout: 50 }), "off");
  assert.equal(auditValue({ active: true, rollout: 50 }), "on:50");
  assert.equal(auditValue({ active: true, rollout: 100 }), "on:100");
  const now = 1_000_000;
  const prior = Array.from({ length: 8 }, (_, i) => now - i);
  assert.equal(allowFeatureWrite(prior, now), false);
  assert.equal(allowFeatureWrite(prior.map((stamp) => stamp - 120_000), now), true);
  const stats = parseFlagStats({
    results: [
      ["parent-helper", 4, 1],
      ["not-a-kidease-flag", 9, 9],
    ],
  });
  assert.deepEqual(stats["parent-helper"], { calls: 4, trues: 1 });
  assert.equal(stats["not-a-kidease-flag"], undefined);
});
