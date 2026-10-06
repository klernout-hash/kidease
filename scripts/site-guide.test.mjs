import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { AI_FLAGS } from "../src/lib/ai/flags.ts";
import {
  asksForProfile,
  cityFromQuestion,
  finishGuideAnswer,
  guideAudienceFromRole,
  prepareGuideTurn,
} from "../src/lib/ai/site-guide.ts";
import { RANKING_BEST_MATCH_FLAG } from "../src/lib/ranking/weights.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("a city count uses the live number and never invents one", () => {
  const on = prepareGuideTurn({
    question: "How many listings in Edmonton",
    audience: "guest",
    locale: "en",
    cityCount: 812,
  });
  assert.equal(on.needsCityCount, true);
  assert.equal(on.citySlug, "edmonton");
  assert.equal(on.direct?.known, true);
  assert.match(on.direct?.answer || "", /812/);
  assert.equal(on.direct?.path, "/daycare/city/edmonton");
  assert.doesNotMatch(on.direct?.answer || "", /\b0\b/);
  const missing = prepareGuideTurn({
    question: "How many listings in Edmonton",
    audience: "guest",
    locale: "en",
    cityCount: null,
  });
  assert.doesNotMatch(missing.direct?.answer || "", /\b812\b/);
  assert.doesNotMatch(missing.direct?.answer || "", /\b0 licensed\b/);
  assert.equal(missing.direct?.path, "/daycare/city/edmonton");
  const fr = prepareGuideTurn({
    question: "Combien de fiches à Montréal",
    audience: "parent",
    locale: "fr",
    cityCount: 1400,
  });
  assert.equal(fr.citySlug, "montreal");
  assert.match(fr.direct?.answer || "", /1400/);
  assert.equal(fr.direct?.path, "/fr/daycare/city/montreal");
  assert.doesNotMatch(fr.direct?.answer || "", /\blistings\b/);
  assert.equal(cityFromQuestion("how many in quebec"), null);
  assert.equal(cityFromQuestion("how many in Quebec City")?.slug, "quebec-city");
});

test("the same flags answer in English and French, and a parent does not see daycare tools", () => {
  const flags = { [AI_FLAGS.parentHelper]: true, [AI_FLAGS.smartMatch]: true, [AI_FLAGS.listingWriter]: true };
  const en = prepareGuideTurn({ question: "What AI can I use?", audience: "parent", locale: "en", flags });
  const fr = prepareGuideTurn({ question: "Quels outils d'IA puis-je utiliser?", audience: "parent", locale: "fr", flags });
  assert.match(en.direct?.answer || "", /Find my match/);
  assert.doesNotMatch(en.direct?.answer || "", /Write it for me/);
  assert.match(fr.direct?.answer || "", /Trouver mon centre/);
  assert.doesNotMatch(fr.direct?.answer || "", /Find my match|Write it for me|listing/);
  assert.equal(en.direct?.path, "/help");
  assert.equal(fr.direct?.path, "/fr/help");
  const provider = prepareGuideTurn({
    question: "What AI can I use?",
    audience: "provider",
    locale: "en",
    flags: { ...flags, [AI_FLAGS.listingWriter]: false, [RANKING_BEST_MATCH_FLAG]: true },
  });
  assert.match(provider.direct?.answer || "", /help chat/);
  assert.doesNotMatch(provider.direct?.answer || "", /Write it for me|Find my match|Best match/);
  const off = prepareGuideTurn({ question: "What AI can I use?", audience: "parent", locale: "en", flags: {} });
  assert.match(off.direct?.answer || "", /off for you/);
  assert.doesNotMatch(off.direct?.answer || "", /Find my match/);
});

test("profile questions point at the account page and never claim a save", () => {
  assert.equal(asksForProfile("Please update my email"), true);
  const guest = prepareGuideTurn({ question: "update my name", audience: "guest", locale: "en" });
  assert.match(guest.direct?.answer || "", /can't change/);
  assert.equal(guest.direct?.path, "/login");
  assert.doesNotMatch(guest.direct?.answer || "", /saved|updated your/i);
  const parent = prepareGuideTurn({ question: "change my profile photo", audience: "parent", locale: "fr" });
  assert.equal(parent.direct?.path, "/account");
  assert.match(parent.direct?.answer || "", /clavardage/);
  assert.doesNotMatch(parent.direct?.answer || "", /\b(Profile|Search|listing|Save)\b/);
  assert.equal(guideAudienceFromRole("provider"), "provider");
  assert.equal(guideAudienceFromRole("admin"), "admin");
  assert.equal(guideAudienceFromRole(null), "parent");
});

test("a model I-do-not-know does not cite a page when the guide has no answer", () => {
  const turn = prepareGuideTurn({ question: "What is the weather tomorrow?", audience: "guest", locale: "en" });
  assert.equal(turn.direct, null);
  const refused = finishGuideAnswer({ answer: "I do not know.", path: "/faq" }, turn, "en");
  assert.equal(refused.known, false);
  assert.equal(refused.path, null);
  const invented = finishGuideAnswer({ answer: "Edmonton has 99999 listings.", path: "/faq" }, turn, "en");
  assert.equal(invented.known, false);
  const edmonton = prepareGuideTurn({
    question: "How many listings in Edmonton",
    audience: "guest",
    locale: "en",
    cityCount: 50,
  });
  const kept = finishGuideAnswer({ answer: "I do not know.", path: "/faq" }, edmonton, "en");
  assert.equal(kept.known, true);
  assert.match(kept.answer, /50/);
  assert.doesNotMatch(kept.answer, /99999|do not know/i);
});

test("search and claim stay on the real pages, in French too", () => {
  const search = prepareGuideTurn({ question: "How do I search for a daycare?", audience: "guest", locale: "fr" });
  assert.equal(search.direct?.path, "/fr/search");
  assert.doesNotMatch(search.direct?.answer || "", /\bSearch\b|\blisting\b/);
  const claim = prepareGuideTurn({ question: "How do I claim a listing?", audience: "provider", locale: "en" });
  assert.equal(claim.direct?.path, "/claim");
  assert.match(claim.direct?.answer || "", /confirm you run/);
  const map = prepareGuideTurn({ question: "How do I use the whole site?", audience: "parent", locale: "en" });
  assert.equal(map.direct?.path, "/how-it-works");
  assert.match(map.direct?.answer || "", /parent desk/);
});

test("the four starter questions each land on a real page", () => {
  const starters = [
    ["How do I find a daycare?", "en", "/search"],
    ["How do I request a tour?", "en", "/help"],
    ["Where are my waitlists?", "en", "/parent"],
    ["What can I use?", "en", "/search"],
    ["Comment trouver une garderie ?", "fr", "/fr/search"],
    ["Comment demander une visite ?", "fr", "/fr/help"],
    ["Où est ma liste d'attente ?", "fr", "/parent"],
    ["Quels outils puis-je utiliser ?", "fr", "/fr/search"],
  ];
  for (const [question, locale, path] of starters) {
    const turn = prepareGuideTurn({
      question,
      audience: "parent",
      locale,
      flags: locale === "fr" ? {} : { "parent-helper": false },
    });
    assert.equal(turn.direct?.known, true, question);
    assert.equal(turn.direct?.path, path, question);
  }
  const bot = read("src/components/help-bot.tsx");
  assert.match(bot, /helpBotQ1/);
  assert.match(bot, /sendText\(t\(key\)\)/);
  assert.match(read("src/lib/copy.ts"), /Tap a question/);
  assert.match(read("src/lib/copy.ts"), /Touchez une question/);
});

test("the chat reads the guide and does not write a profile", () => {
  const server = read("src/lib/server/parent-helper.ts");
  const bot = read("src/components/help-bot.tsx");
  assert.match(server, /prepareGuideTurn/);
  assert.match(server, /liveHubCount/);
  assert.match(server, /finishGuideAnswer/);
  assert.match(server, /select role from profiles/);
  assert.doesNotMatch(server, /saveMyContact|askKidEase|update profiles/);
  assert.match(bot, /locale/);
  assert.match(bot, /askParentHelper/);
  assert.doesNotMatch(bot, /askKidEase/);
  assert.doesNotMatch(bot, /\$\{res\.path\}/);
  assert.match(read("src/lib/ai/site-guide.ts"), /I can't change your profile from chat/);
});
