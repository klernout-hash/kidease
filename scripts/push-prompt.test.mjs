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

test("parent and centre explanations stay distinct in both languages", async () => {
  const { pushExplainCopy } = await import("../src/lib/push-prompt.ts");
  for (const lang of ["en", "fr"]) {
    const parent = pushExplainCopy("parent", lang);
    const centre = pushExplainCopy("daycare", lang);
    assert.notEqual(parent.body, centre.body);
    assert.match(centre.body, /centre/);
    assert.match(parent.body, /daycares|garderies/);
    assert.doesNotMatch(centre.body, /daycares|garderies/);
  }
});

test("push boot is non-visual and in-flow explainer requires a tap", async () => {
  const { readFileSync } = await import("node:fs");
  const read = (name) => readFileSync(new URL(name, import.meta.url), "utf8");
  const root = read("../src/routes/__root.tsx");
  const component = read("../src/components/push-explain.tsx");
  const settings = read("../src/components/alert-push-settings.tsx");
  const client = read("../src/lib/push-client.ts");
  assert.match(root, /<PushRegistrationBoot\s*\/>/);
  assert.doesNotMatch(root, /<PushExplain\b/);
  assert.match(settings, /<PushExplain key=\{audience\} audience=\{audience\}/);
  assert.match(component, /opened \? \(\s*<section data-ke="push-explain"/);
  assert.match(component, /onClick=\{\(\) => setOpened\(true\)\}/);
  assert.doesNotMatch(component, /\bfixed\b|\babsolute\b|dataset\.nativePrompt/);
  assert.match(component, /allowPermissionPrompt: false/);
  assert.match(client, /decision === "ask" && opts.allowPermissionPrompt === false/);
  assert.match(client, /pushPermissionDecision\(receive\) !== "register"/);
  assert.match(component, /choice\.value !== "yes" \|\| await pushPermissionStillPending\(samsungPush\)/);
  assert.match(component, /if \(!result\.ok\) \{\s*setFailed\(true\);\s*return;\s*\}\s*\}\s*await Preferences\.set/);
});
