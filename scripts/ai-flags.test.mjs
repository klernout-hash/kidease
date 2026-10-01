import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { AI_FLAGS, aiBucket } from "../src/lib/ai/flags.ts";
import { fetchAiFeatureFlags, resetAiFlagFetchForTests } from "../src/lib/ai/flag-fetch.ts";
import { aiFeatureVisible, parseAiFlagSnapshot, sanitizeAiDistinctId } from "../src/lib/ai/flag-gate.ts";
import { parseCentreMatch } from "../src/lib/ai/match-reply.ts";
import { rankingFlagOn } from "../src/lib/ranking/variant.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

const OFF = {
  featureFlags: { "smart-match": false, "ai-listing-writer": false, "ranking-best-match": false },
  flags: {
    "smart-match": { enabled: false },
    "ai-listing-writer": { enabled: false },
    "ranking-best-match": { enabled: false },
  },
};

test("a 0% PostHog flag hides smart match and the listing writer", () => {
  const snapshot = parseAiFlagSnapshot(OFF, ["smart-match", "ai-listing-writer"]);
  assert.equal(snapshot.reached, true);
  assert.equal(snapshot.flags["smart-match"], false);
  assert.equal(snapshot.flags["ai-listing-writer"], false);
  const showAtFifty = aiBucket("parent-who-would-see-the-builtin-half");
  assert.equal(
    aiFeatureVisible({ flag: AI_FLAGS.smartMatch, bucket: 0, snapshot }),
    false,
  );
  assert.equal(
    aiFeatureVisible({ flag: AI_FLAGS.listingWriter, bucket: showAtFifty, snapshot }),
    false,
  );
  assert.equal(
    aiFeatureVisible({ flag: AI_FLAGS.smartMatch, bucket: 0, snapshot: { reached: false, flags: {} } }),
    true,
  );
  assert.equal(
    aiFeatureVisible({ flag: AI_FLAGS.smartMatch, bucket: 99, snapshot: { reached: false, flags: {} } }),
    false,
  );
  assert.equal(
    aiFeatureVisible({
      flag: AI_FLAGS.smartMatch,
      bucket: 99,
      snapshot: { reached: true, flags: { "smart-match": true } },
    }),
    true,
  );
});

test("the flag request evaluates PostHog and does not return the key", async () => {
  resetAiFlagFetchForTests();
  const calls = [];
  const snapshot = await fetchAiFeatureFlags({
    distinctId: "parent@example.com",
    now: 1_000,
    env: { VITE_PUBLIC_POSTHOG_KEY: "phc_test_not_real" },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
      if (String(url).includes("/flags")) {
        return new Response(JSON.stringify(OFF), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("ok", { status: 200 });
    },
  });
  assert.equal(snapshot.reached, true);
  assert.equal(snapshot.flags["smart-match"], false);
  assert.equal(JSON.stringify(snapshot).includes("phc_test_not_real"), false);
  assert.equal(calls[0].url, "https://us.i.posthog.com/flags?v=2");
  assert.equal(calls[0].body.distinct_id, "kidease-server");
  assert.equal(calls[0].body.api_key, "phc_test_not_real");
  assert.equal(calls[0].body.flag_keys.includes("smart-match"), true);
  assert.equal(calls[0].body.flag_keys.includes("ranking-best-match"), true);
  assert.equal(calls[1].url, "https://us.i.posthog.com/batch/");
  assert.equal(calls[1].body.batch[0].event, "$feature_flag_called");
  assert.equal(calls[1].body.batch[0].properties.$feature_flag, "smart-match");
  assert.equal(calls[1].body.batch[0].properties.$feature_flag_response, false);
  const rankingCall = calls[1].body.batch.find((row) => row.properties.$feature_flag === "ranking-best-match");
  assert.equal(rankingCall.event, "$feature_flag_called");
  assert.equal(rankingCall.properties.$feature_flag_response, false);
  assert.equal(rankingFlagOn(snapshot), false);
  assert.equal(JSON.stringify(calls[1].body).includes("parent@example.com"), false);

  const cached = await fetchAiFeatureFlags({
    distinctId: "kidease-server",
    now: 2_000,
    env: { VITE_PUBLIC_POSTHOG_KEY: "phc_test_not_real" },
    fetchImpl: async () => {
      throw new Error("cache should answer");
    },
  });
  assert.equal(cached.flags["ai-listing-writer"], false);
  assert.equal(sanitizeAiDistinctId("parent@example.com"), "kidease-server");
});

test("a PostHog miss uses the 50% path and a down request does not throw", async () => {
  resetAiFlagFetchForTests();
  const missing = await fetchAiFeatureFlags({
    distinctId: "visitor-12345678",
    env: {},
    fetchImpl: async () => {
      throw new Error("no key");
    },
  });
  assert.equal(missing.reached, false);
  const down = await fetchAiFeatureFlags({
    distinctId: "visitor-12345678",
    env: { POSTHOG_FLAGS_KEY: "phc_test_not_real" },
    fetchImpl: async () => new Response("no", { status: 503 }),
  });
  assert.equal(down.reached, false);
  assert.equal(parseAiFlagSnapshot({ errorsWhileComputingFlags: true }, ["smart-match"]).reached, false);
});

test("ranking-best-match is on only when PostHog says on", async () => {
  resetAiFlagFetchForTests();
  const calls = [];
  const on = await fetchAiFeatureFlags({
    distinctId: "visitor-ranking-on",
    now: 5_000,
    env: { VITE_PUBLIC_POSTHOG_KEY: "phc_test_not_real" },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
      if (String(url).includes("/flags")) {
        return new Response(
          JSON.stringify({ flags: { "ranking-best-match": { enabled: true }, "smart-match": { enabled: false } } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("ok", { status: 200 });
    },
  });
  assert.equal(on.reached, true);
  assert.equal(rankingFlagOn(on), true);
  assert.equal(calls[0].body.flag_keys.includes("ranking-best-match"), true);
  const called = calls[1].body.batch.find((row) => row.properties.$feature_flag === "ranking-best-match");
  assert.equal(called.event, "$feature_flag_called");
  assert.equal(called.properties.$feature_flag_response, true);

  resetAiFlagFetchForTests();
  const off = await fetchAiFeatureFlags({
    distinctId: "visitor-ranking-off",
    now: 5_000,
    env: { VITE_PUBLIC_POSTHOG_KEY: "phc_test_not_real" },
    fetchImpl: async (url) => {
      if (String(url).includes("/flags")) {
        return new Response(JSON.stringify({ flags: { "ranking-best-match": { enabled: false } } }), { status: 200 });
      }
      return new Response("ok", { status: 200 });
    },
  });
  assert.equal(rankingFlagOn(off), false);

  resetAiFlagFetchForTests();
  const down = await fetchAiFeatureFlags({
    distinctId: "visitor-ranking-down",
    now: 5_000,
    env: { VITE_PUBLIC_POSTHOG_KEY: "phc_test_not_real" },
    fetchImpl: async () => new Response("no", { status: 503 }),
  });
  assert.equal(down.reached, false);
  assert.equal(rankingFlagOn(down), false);

  resetAiFlagFetchForTests();
  const missingKey = await fetchAiFeatureFlags({
    distinctId: "visitor-ranking-nokey",
    env: {},
    fetchImpl: async () => {
      throw new Error("should not fetch");
    },
  });
  assert.equal(rankingFlagOn(missingKey), false);
});

test("search reads ranking-best-match on the server, not the browser SDK", () => {
  const search = read("src/routes/search.tsx");
  const hook = read("src/lib/ranking/use-ranking-flag.ts");
  const fetchSrc = read("src/lib/ai/flag-fetch.ts");
  const gate = read("src/lib/ai/flag-gate.ts");
  assert.match(search, /useRankingBestMatchFlag/);
  assert.doesNotMatch(search, /isPostHogFlagEnabled/);
  assert.doesNotMatch(search, /getPostHog/);
  assert.match(hook, /readAiFeatureFlags/);
  assert.match(hook, /rankingFlagOn/);
  assert.doesNotMatch(hook, /rankingBucket/);
  assert.doesNotMatch(hook, /isPostHogFlagEnabled/);
  assert.match(gate, /RANKING_BEST_MATCH_FLAG/);
  assert.match(fetchSrc, /SERVER_FLAG_KEYS/);
  assert.match(fetchSrc, /\$feature_flag_called/);
});

test("the quiz and the writer stay hidden until the real flag is read", () => {
  const hook = read("src/lib/ai/use-ai-flag.ts");
  const smart = read("src/components/smart-match.tsx");
  const writer = read("src/components/listing-writer.tsx");
  assert.match(hook, /useState\(false\)/);
  assert.match(hook, /aiFeatureVisible/);
  assert.match(hook, /readAiFeatureFlags/);
  assert.match(smart, /useAiFeatureFlag\(AI_FLAGS\.smartMatch\)/);
  assert.match(writer, /useAiFeatureFlag\(AI_FLAGS\.listingWriter\)/);
  assert.match(smart, /if \(!on\) return null/);
  assert.match(writer, /if \(!on\) return null/);
  assert.doesNotMatch(smart, /aiFlagDefaultOn/);
  assert.doesNotMatch(writer, /aiFlagDefaultOn/);
  assert.match(read("src/lib/server/ai-flags.ts"), /fetchAiFeatureFlags/);
});

test("in-app chat uses the shared client and match drops invented centres", () => {
  const ai = read("src/lib/server/ai.ts");
  assert.match(ai, /callAi/);
  assert.match(ai, /feature: "in-app-chat"/);
  assert.match(ai, /feature: "match-centres"/);
  assert.doesNotMatch(ai, /api\.x\.ai/);
  assert.doesNotMatch(ai, /XAI_API_KEY/);
  const parsed = parseCentreMatch(
    'Sure. {"picks":[{"slug":"real-centre","why":"Licensed nearby"},{"slug":"invented-centre","why":"Not in the catalog"}],"note":"Two ideas"}',
    ["real-centre"],
  );
  assert.deepEqual(parsed?.picks.map((row) => row.slug), ["real-centre"]);
  assert.equal(parseCentreMatch("no json", ["real-centre"]), null);
});
