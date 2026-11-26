import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { voiceCallErrorPlan, withinMs } from "../src/lib/voice-device.ts";

test("VC1: call errors are shown, only 31009 re-registers", () => {
  assert.equal(voiceCallErrorPlan(31009), "register");
  for (const code of [31000, 31005, 31201, 31208, 53405, Number.NaN]) assert.equal(voiceCallErrorPlan(code), "show");
});

test("VC1: the mic check times out instead of hanging", async () => {
  assert.equal(await withinMs(new Promise(() => {}), 20, "timeout"), "timeout");
  assert.equal(await withinMs(Promise.resolve("ok"), 1000, "timeout"), "ok");
});

test("VC1: Start shows an alert with Try again, and no mic is an error", () => {
  const src = readFileSync(new URL("../src/components/voice-call-panel.tsx", import.meta.url), "utf8");
  assert.match(src, /role="alert"/);
  assert.match(src, /t\("tryAgain"\)/);
  assert.match(src, /voiceNoMic/);
  assert.doesNotMatch(src, /if \(!device\) return;/);
  for (const f of ["copy-en", "copy-fr"]) {
    const copy = readFileSync(new URL(`../src/lib/${f}.ts`, import.meta.url), "utf8");
    assert.match(copy, /voiceCheckingMic:/);
    assert.match(copy, /voiceNoMic:/);
  }
});
