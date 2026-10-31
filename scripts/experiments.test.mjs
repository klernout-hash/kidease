import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EXPERIMENTS,
  assignVariant,
  experimentsEnabled,
  exposureEvent,
  searchOrder,
  signupHeadline,
} from "../src/lib/experiments.ts";

test("experiments default off and send no exposure", () => {
  assert.equal(experimentsEnabled({}), false);
  assert.equal(assignVariant({ enabled: false, experiment: EXPERIMENTS.signupHeadline, distinctId: "parent-1" }), "off");
  assert.equal(exposureEvent({ enabled: false, experiment: EXPERIMENTS.searchOrder, distinctId: "parent-1" }), null);
  assert.equal(searchOrder("off"), "distance");
  assert.equal(searchOrder("control"), "distance");
  assert.equal(searchOrder("treatment"), "name");
});

test("the same parent keeps the same variant", () => {
  const first = assignVariant({ enabled: true, experiment: EXPERIMENTS.signupHeadline, distinctId: "parent-42" });
  const second = assignVariant({ enabled: true, experiment: EXPERIMENTS.signupHeadline, distinctId: "parent-42" });
  assert.equal(first, second);
  assert.ok(first === "control" || first === "treatment");
  assert.notEqual(signupHeadline("treatment", "en"), signupHeadline("control", "en"));
  assert.match(signupHeadline("treatment", "fr"), /garderie permise/);
});
