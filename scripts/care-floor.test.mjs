import assert from "node:assert/strict";
import { test } from "node:test";
import { healthAnswers, markRoll, pickupMatches, rollCanClose } from "../src/lib/care-floor.ts";

test("a roll closes only after someone is accounted for", () => {
  const marks = markRoll([], { kind: "child", name: "  Ada  ", accounted: true });
  assert.equal(marks[0].name, "Ada");
  assert.equal(rollCanClose([]), false);
  assert.equal(rollCanClose(marks), true);
  assert.equal(markRoll(marks, { kind: "child", name: "ada", accounted: false })[0].accounted, false);
});

test("pickup matches the authorised list and health needs every answer", () => {
  assert.equal(pickupMatches("sam lee", ["Sam Lee", "Jo"]), "Sam Lee");
  assert.equal(pickupMatches("stranger", ["Sam Lee"]), null);
  assert.equal(healthAnswers({ fever: false, rash: false, cough: true, vomiting: false })?.cough, true);
  assert.equal(healthAnswers({ fever: false }), null);
});
