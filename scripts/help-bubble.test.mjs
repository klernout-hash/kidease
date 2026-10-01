import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { AI_FLAGS } from "../src/lib/ai/flags.ts";
import {
  BUBBLE_HARD_LIMIT,
  BUBBLE_SOFT_LIMIT,
  bubbleQuestionForModel,
  bubbleVisible,
  consumeBubbleAsk,
  resetBubbleAsksForTests,
} from "../src/lib/ai/help-bubble.ts";
import { parentHelperModelUser } from "../src/lib/ai/parent-helper.ts";
import { tx } from "../src/lib/copy.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("the bubble stays hidden when the parent-helper flag is off", () => {
  assert.equal(bubbleVisible({ reached: false, flags: {} }, 0), false);
  assert.equal(bubbleVisible({ reached: true, flags: { [AI_FLAGS.parentHelper]: false } }, 0), false);
  assert.equal(bubbleVisible({ reached: true, flags: {} }, 1), false);
  const bot = read("src/components/help-bot.tsx");
  assert.match(bot, /useAiFeatureFlag\(AI_FLAGS\.parentHelper\)/);
  assert.match(bot, /if \(!ready \|\| !helperOn\) return null/);
  assert.doesNotMatch(bot, /inAppChatEnabled/);
});

test("the bubble shows when the parent-helper flag is on", () => {
  assert.equal(bubbleVisible({ reached: true, flags: { [AI_FLAGS.parentHelper]: true } }, 99), true);
  const bot = read("src/components/help-bot.tsx");
  assert.match(bot, /return <HelpBot \/>/);
});

test("the bubble never calls askKidEase", () => {
  const bot = read("src/components/help-bot.tsx");
  assert.doesNotMatch(bot, /askKidEase/);
  assert.match(bot, /askParentHelper/);
  assert.match(bot, /requestParentHelperAgent/);
  const server = read("src/lib/server/parent-helper.ts");
  assert.doesNotMatch(server, /askKidEase/);
  assert.match(server, /parentHelperModelUser/);
  assert.match(server, /insert into support_cases/);
});

test("a signed-out ask works until the limit, then Turnstile", () => {
  resetBubbleAsksForTests();
  for (let i = 0; i < BUBBLE_SOFT_LIMIT; i += 1) {
    assert.equal(consumeBubbleAsk("signed-out", 5_000, false).ok, true);
  }
  const blocked = consumeBubbleAsk("signed-out", 5_000, false);
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.error, "turnstile");
  assert.equal(consumeBubbleAsk("signed-out", 5_000, true).ok, true);
  const bot = read("src/components/help-bot.tsx");
  assert.doesNotMatch(bot, /helpBotSignIn/);
  const server = read("src/lib/server/parent-helper.ts");
  assert.match(server, /sessionBearerMiddleware/);
  assert.match(server, /consumeBubbleAsk/);
  assert.match(server, /verifyTurnstileResponse/);
  assert.doesNotMatch(server, /authMiddleware/);
});

test("the hard limit holds even after Turnstile", () => {
  resetBubbleAsksForTests();
  for (let i = 0; i < BUBBLE_HARD_LIMIT; i += 1) {
    assert.equal(consumeBubbleAsk("hard", 9_000, true).ok, true);
  }
  const stopped = consumeBubbleAsk("hard", 9_000, true);
  assert.equal(stopped.ok, false);
  if (!stopped.ok) assert.equal(stopped.error, "rate_limited");
});

test("the model never sees an email, and the ticket does not promise a time", () => {
  const question = bubbleQuestionForModel("Email me at parent@example.ca about a spot");
  assert.doesNotMatch(question, /parent@example\.ca/);
  assert.doesNotMatch(parentHelperModelUser(question), /parent@example\.ca/);
  for (const locale of ["en", "fr"]) {
    const ticket = tx(locale, "helpBotTicket");
    assert.match(ticket, /ticket|billet/i);
    assert.doesNotMatch(ticket, /same day|usually|within|minute|hour|business day|aujourd'hui|heure/i);
  }
});
