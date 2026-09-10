import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_TRANSACTIONAL_MAIL_FROM,
  isApexKidEaseFrom,
  isResendSendFrom,
  mailFromEmail,
  transactionalMailFrom,
} from "../src/lib/mail-from.ts";

test("transactional From ignores Titan apex and keeps send.kidease.ca", () => {
  assert.equal(DEFAULT_TRANSACTIONAL_MAIL_FROM, "KidEase <noreply@send.kidease.ca>");
  assert.equal(mailFromEmail("KidEase <noreply@send.kidease.ca>"), "noreply@send.kidease.ca");
  assert.equal(isResendSendFrom("KidEase <noreply@send.kidease.ca>"), true);
  assert.equal(isResendSendFrom("KidEase <login@send.kidease.ca>"), true);
  assert.equal(isResendSendFrom("KidEase <kyle@kidease.ca>"), false);
  assert.equal(isApexKidEaseFrom("KidEase <kyle@kidease.ca>"), true);
  assert.equal(isApexKidEaseFrom("kyle@kidease.ca"), true);
  assert.equal(isApexKidEaseFrom("KidEase <noreply@send.kidease.ca>"), false);
  assert.equal(transactionalMailFrom(""), DEFAULT_TRANSACTIONAL_MAIL_FROM);
  assert.equal(transactionalMailFrom("KidEase <kyle@kidease.ca>"), DEFAULT_TRANSACTIONAL_MAIL_FROM);
  assert.equal(transactionalMailFrom("KidEase <login@send.kidease.ca>"), DEFAULT_TRANSACTIONAL_MAIL_FROM);
  assert.equal(transactionalMailFrom("KidEase <alerts@send.kidease.ca>"), "KidEase <alerts@send.kidease.ca>");
});
