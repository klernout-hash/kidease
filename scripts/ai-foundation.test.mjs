import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { resetAiCacheForTests } from "../src/lib/ai/cache.ts";
import { callAi } from "../src/lib/ai/client.ts";
import { costMicros } from "../src/lib/ai/cost.ts";
import { aiBucket, aiFlagDefaultOn, AI_FLAGS } from "../src/lib/ai/flags.ts";
import { scrubFacts, scrubText } from "../src/lib/ai/pii.ts";
import { allowAiCall, resetAiRateLimitForTests } from "../src/lib/ai/rate-limit.ts";
import { summarizeAiCalls } from "../src/lib/ai/usage.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("the scrubber removes contact, birthdate, and health details", () => {
  const raw = "Email me at parent@example.com or 204-555-0199. Born 2019-04-13. Asthma. Child name: Sam.";
  const clean = scrubText(raw);
  assert.equal(clean.includes("parent@example.com"), false);
  assert.equal(clean.includes("204-555-0199"), false);
  assert.equal(clean.includes("2019-04-13"), false);
  assert.equal(clean.includes("Asthma"), false);
  assert.equal(clean.includes("Sam"), false);
  const facts = scrubFacts({
    city: "Winnipeg",
    email: "parent@example.com",
    childName: "Sam",
    birthdate: "2019-04-13",
    health: "asthma",
    ages: "infant",
  });
  assert.deepEqual(facts, { city: "Winnipeg", ages: "infant" });
});

test("a failed or invalid model call does not throw and does not invent facts", async () => {
  resetAiCacheForTests();
  resetAiRateLimitForTests();
  const schema = z.object({ city: z.literal("Winnipeg") });
  const bad = await callAi({
    feature: "test",
    system: "facts only",
    user: "city Winnipeg",
    schema,
    userId: "user_1",
    deps: {
      env: { XAI_API_KEY: "test-key" },
      fetchImpl: async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: '{"city":"Toronto"}' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    },
  });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.error, "invalid");

  const down = await callAi({
    feature: "test",
    system: "facts only",
    user: "other",
    userId: "user_1",
    deps: {
      env: { XAI_API_KEY: "test-key" },
      fetchImpl: async () => new Response("no", { status: 500 }),
    },
  });
  assert.equal(down.ok, false);
});

test("identical calls are cached and a missing key falls back", async () => {
  resetAiCacheForTests();
  resetAiRateLimitForTests();
  let hits = 0;
  const deps = {
    env: { XAI_API_KEY: "test-key" },
    fetchImpl: async () => {
      hits += 1;
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "Close to home" } }], usage: { prompt_tokens: 20, completion_tokens: 4 } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  };
  const first = await callAi({ feature: "why", system: "facts", user: "listing A", userId: "user_2", deps });
  const second = await callAi({ feature: "why", system: "facts", user: "listing A", userId: "user_2", deps });
  assert.equal(first.ok && second.ok, true);
  if (first.ok && second.ok) {
    assert.equal(second.cached, true);
    assert.equal(second.data, "Close to home");
  }
  assert.equal(hits, 1);
  const missing = await callAi({
    feature: "why",
    system: "facts",
    user: "listing B",
    userId: "user_2",
    deps: { env: {}, fetchImpl: deps.fetchImpl },
  });
  assert.equal(missing.ok, false);
});

test("rate limit, cost, flags, and usage stay predictable", () => {
  resetAiRateLimitForTests();
  assert.equal(allowAiCall({ userId: "u", now: 1_000 }), true);
  assert.equal(allowAiCall({}), false);
  assert.equal(costMicros({ inputTokens: 1_000_000, outputTokens: 0, inputUsdPerM: 0.2 }), 200_000);
  assert.equal(aiFlagDefaultOn(AI_FLAGS.smartMatch, 49), true);
  assert.equal(aiFlagDefaultOn(AI_FLAGS.smartMatch, 50), false);
  assert.equal(aiFlagDefaultOn(AI_FLAGS.truthChecker, 0), false);
  assert.equal(aiFlagDefaultOn(AI_FLAGS.truthChecker, 0, true), true);
  assert.equal(aiBucket("parent_1") >= 0 && aiBucket("parent_1") < 100, true);
  const rows = summarizeAiCalls([
    { feature: "smart-match", ok: true, costMicros: 10 },
    { feature: "smart-match", ok: false, costMicros: 5 },
  ]);
  assert.equal(rows[0]?.calls, 2);
  assert.equal(rows[0]?.failures, 1);
  assert.equal(rows[0]?.failureRate, 0.5);
});

test("the call log stores no prompt and the admin page is gated", () => {
  const sql = readFileSync(join(root, "migrations/0071_ai_calls.sql"), "utf8");
  assert.match(sql, /feature text/);
  assert.doesNotMatch(sql, /prompt|child_name|email|phone/i);
  const page = readFileSync(join(root, "src/routes/admin-ai.tsx"), "utf8");
  assert.match(page, /beforeLoadAdminDesk/);
  assert.match(page, /listAiUsage/);
  const client = readFileSync(join(root, "src/lib/ai/client.ts"), "utf8");
  assert.match(client, /scrubText/);
  assert.match(client, /api\.x\.ai/);
  assert.match(client, /ai-gateway\.vercel\.sh/);
  assert.match(client, /AI_GATEWAY_API_KEY/);
});

test("a gateway key is preferred and a direct key still reaches xAI", async () => {
  resetAiCacheForTests();
  resetAiRateLimitForTests();
  const calls = [];
  const logs = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")), authorization: init?.headers?.authorization });
    return new Response(
      JSON.stringify({ choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const gateway = await callAi({
    feature: "gateway",
    system: "facts",
    user: "one",
    userId: "user_g",
    deps: {
      env: { AI_GATEWAY_API_KEY: "gateway-secret", XAI_API_KEY: "direct-secret", XAI_MODEL: "grok-4-1-fast-non-reasoning" },
      fetchImpl,
      log: (row) => logs.push(row),
    },
  });
  assert.equal(gateway.ok, true);
  assert.equal(calls[0].url, "https://ai-gateway.vercel.sh/v1/chat/completions");
  assert.equal(calls[0].body.model, "spacexai/grok-4.1-fast-non-reasoning");
  assert.equal(calls[0].authorization, "Bearer gateway-secret");
  assert.equal(JSON.stringify(logs).includes("gateway-secret"), false);
  assert.equal(JSON.stringify(logs).includes("direct-secret"), false);

  const direct = await callAi({
    feature: "direct",
    system: "facts",
    user: "two",
    userId: "user_g",
    deps: { env: { XAI_API_KEY: "direct-secret" }, fetchImpl },
  });
  assert.equal(direct.ok, true);
  assert.equal(calls[1].url, "https://api.x.ai/v1/chat/completions");
  assert.equal(calls[1].body.model, "grok-4-1-fast-non-reasoning");
  assert.equal(calls[1].authorization, "Bearer direct-secret");
});
