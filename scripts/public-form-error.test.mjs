import assert from "node:assert/strict";
import { test } from "node:test";
import { en } from "../src/lib/copy-en.ts";
import { fr } from "../src/lib/copy-fr.ts";
import { publicFormErrorMessage } from "../src/lib/public-form-error.ts";

test("public security-check errors use the caller's English or French recovery message", () => {
  for (const pack of [en, fr]) {
    for (const error of [
      new Error("Turnstile verification failed"),
      new Error("security check rejected"),
      "CAPTCHA expired",
      "challenge required",
    ]) {
      assert.equal(
        publicFormErrorMessage(error, pack.contactSendFailed, pack.turnstileRequired),
        pack.turnstileRequired,
      );
    }
  }
  assert.notEqual(en.turnstileRequired, fr.turnstileRequired);
});

test("other public-form failures retain the localized fallback and hide service errors", () => {
  for (const pack of [en, fr]) {
    for (const error of [new Error("Resend 403"), new Error("offline"), null, undefined]) {
      assert.equal(
        publicFormErrorMessage(error, pack.contactSendFailed, pack.turnstileRequired),
        pack.contactSendFailed,
      );
    }
  }
});

test("existing callers without an explicit security-check message retain the English default", () => {
  assert.equal(
    publicFormErrorMessage(new Error("turnstile failed"), "fallback"),
    en.turnstileRequired,
  );
});
