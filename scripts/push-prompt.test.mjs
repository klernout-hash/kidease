import assert from "node:assert/strict";
import { test } from "node:test";
import { pushPromptStep } from "../src/lib/push-prompt.ts";

test("push permission is never requested on the first launch", () => {
  assert.equal(pushPromptStep({ enabled: true, firstLaunch: true, choice: null }), "skip-first");
  assert.equal(pushPromptStep({ enabled: true, firstLaunch: false, choice: null }), "explain");
  assert.equal(pushPromptStep({ enabled: true, firstLaunch: false, choice: "yes" }), "register");
  assert.equal(pushPromptStep({ enabled: true, firstLaunch: false, choice: "no" }), "done");
  assert.equal(pushPromptStep({ enabled: false, firstLaunch: false, choice: null }), "done");
});
