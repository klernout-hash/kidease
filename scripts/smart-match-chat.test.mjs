import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  answersToQuiz,
  currentMatchStep,
  EMPTY_MATCH_ANSWERS,
  parseAgeText,
  parsePriorityText,
  parseRadiusKm,
  parseScheduleText,
  parseStartText,
  rewindMatchAnswers,
  wantsSubsidy,
} from "../src/lib/ai/smart-match-chat.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ui = readFileSync(join(root, "src/components/smart-match.tsx"), "utf8");

test("five questions advance from a chip or typed words, and back rewinds one step", () => {
  let answers = { ...EMPTY_MATCH_ANSWERS };
  assert.equal(currentMatchStep(answers), "age");
  assert.equal(parseAgeText("she is an infant"), "infant");
  answers = { ...answers, age: "toddler" };
  assert.equal(currentMatchStep(answers), "place");
  assert.equal(parseRadiusKm("within 10 km of home"), 10);
  answers = { ...answers, place: "Winnipeg", radiusKm: 10 };
  assert.equal(currentMatchStep(answers), "start");
  assert.deepEqual(parseStartText("next month"), { choice: "next-month", startDate: "" });
  answers = { ...answers, startChoice: "soon", startDate: "" };
  assert.equal(currentMatchStep(answers), "schedule");
  assert.equal(parseScheduleText("weekdays please"), "weekdays");
  answers = { ...answers, schedule: "weekdays" };
  assert.equal(currentMatchStep(answers), "priorities");
  assert.equal(parsePriorityText("we need a subsidy")?.subsidy, true);
  answers = { ...answers, subsidy: true, budget: "any", prioritiesDone: true };
  assert.equal(currentMatchStep(answers), "results");
  const quiz = answersToQuiz(answers);
  assert.equal(quiz.note, "");
  assert.equal(quiz.fullTime, true);
  assert.equal(quiz.budget, "any");
  assert.equal(wantsSubsidy(answers), true);
  assert.equal(wantsSubsidy({ ...answers, subsidy: false, budget: "ten" }), true);
  const back = rewindMatchAnswers(answers);
  assert.equal(back.prioritiesDone, false);
  assert.equal(currentMatchStep(back), "priorities");
  assert.equal(currentMatchStep(rewindMatchAnswers({ ...EMPTY_MATCH_ANSWERS, age: "infant" })), "age");
});

test("the match chat asks in bubbles and does not use the old step sheet", () => {
  assert.match(ui, /data-ke="smart-match-chat"/);
  assert.match(ui, /smartMatchRestart/);
  assert.match(ui, /t\("back"\)/);
  assert.match(ui, /searchDaycares\(/);
  assert.match(ui, /sort: "best"/);
  assert.match(ui, /radiusKm: snapshot\.radiusKm/);
  assert.match(ui, /wantsSubsidy\(snapshot\)/);
  assert.match(ui, /answersToQuiz\(snapshot\)/);
  assert.doesNotMatch(ui, /if \(!on\) return null/);
  assert.match(ui, /mt-3 flex justify-center/);
  assert.match(ui, /useAiFeatureFlag\(AI_FLAGS\.smartMatch\)/);
  assert.match(ui, /helpBubbleDistinctId/);
  assert.doesNotMatch(ui, /smartMatchStep/);
  assert.doesNotMatch(ui, /callAi|XAI_API_KEY/);
  assert.doesNotMatch(ui, /Reply STOP|unsubscribe/i);
});
