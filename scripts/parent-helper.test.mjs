import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { AI_FLAGS, aiFlagDefaultOn } from "../src/lib/ai/flags.ts";
import { aiFeatureVisible } from "../src/lib/ai/flag-gate.ts";
import {
  groundParentAnswer,
  PARENT_HELPER_SYSTEM,
  parentHelperSchema,
  subsidyEstimate,
  TOUR_QUESTIONS,
} from "../src/lib/ai/parent-helper.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("parent-helper stays off when PostHog is off or unreachable", () => {
  assert.equal(aiFlagDefaultOn(AI_FLAGS.parentHelper, 0), false);
  assert.equal(
    aiFeatureVisible({ flag: AI_FLAGS.parentHelper, bucket: 0, snapshot: { reached: false, flags: {} } }),
    false,
  );
  assert.equal(
    aiFeatureVisible({
      flag: AI_FLAGS.parentHelper,
      bucket: 3,
      snapshot: { reached: true, flags: { "parent-helper": false } },
    }),
    false,
  );
  assert.equal(
    aiFeatureVisible({
      flag: AI_FLAGS.parentHelper,
      bucket: 90,
      snapshot: { reached: true, flags: { "parent-helper": true } },
    }),
    true,
  );
});

test("an answer that invents a fee or cites an unknown page is refused", () => {
  const missing = groundParentAnswer(null);
  assert.equal(missing.known, false);
  assert.match(missing.answer, /don't know/);
  const invented = groundParentAnswer({ answer: "The infant fee is $10 a day.", path: "/faq" });
  assert.equal(invented.known, false);
  const wrongPage = groundParentAnswer({ answer: "See the listing.", path: "/daycare/made-up" });
  assert.equal(wrongPage.known, false);
  const kept = groundParentAnswer({
    answer: "The Canada Child Benefit maximum for a child under 6 is 8157 a year.",
    path: "/benefits",
  });
  assert.equal(kept.known, true);
  assert.equal(kept.path, "/benefits");
  assert.equal(parentHelperSchema.safeParse({ answer: kept.answer, path: kept.path, fee: 1 }).success, false);
  assert.match(PARENT_HELPER_SYSTEM, /Do not invent a daycare/);
});

test("a subsidy estimate uses only published figures", () => {
  const ab = subsidyEstimate("AB");
  assert.equal(ab.known, true);
  if (ab.known) assert.equal(ab.amount, 644);
  const mb = subsidyEstimate("MB");
  assert.equal(mb.known, false);
  assert.equal(TOUR_QUESTIONS.length >= 3, true);
  const page = read("src/components/parent-helper.tsx");
  const bot = read("src/components/help-bot.tsx");
  const server = read("src/lib/server/parent-helper.ts");
  assert.match(page, /useAiFeatureFlag\(AI_FLAGS\.parentHelper\)/);
  assert.match(bot, /askParentHelper/);
  assert.match(server, /feature: "parent-helper"/);
  assert.match(server, /scrubText/);
  assert.match(read("src/routes/faq.tsx"), /ParentHelperPanel/);
  assert.match(read("src/routes/search.tsx"), /ParentHelperPanel/);
  assert.match(read("src/routes/fr.search.tsx"), /ParentHelperPanel/);
  assert.match(read("src/lib/ai/flag-gate.ts"), /AI_FLAGS\.parentHelper/);
});
