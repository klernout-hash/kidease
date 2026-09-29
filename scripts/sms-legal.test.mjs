import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { SMS_NO_SHARE, SMS_PRIVACY_EN, SMS_TERMS_EN } from "../src/lib/sms-legal.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("privacy and terms pages attach the SMS section", () => {
  const privacy = readFileSync(join(root, "src/routes/privacy.tsx"), "utf8");
  const terms = readFileSync(join(root, "src/routes/terms.tsx"), "utf8");
  assert.match(privacy, /withSmsSection/);
  assert.match(privacy, /SMS_PRIVACY_EN/);
  assert.match(terms, /SMS_TERMS_EN/);
});

test("Twilio reviewers can read the no-share clause and STOP/HELP", () => {
  assert.match(SMS_NO_SHARE, /No mobile information will be shared/);
  assert.match(SMS_NO_SHARE, /Twilio/);
  const blob = JSON.stringify(SMS_PRIVACY_EN) + JSON.stringify(SMS_TERMS_EN);
  assert.match(blob, /STOP/);
  assert.match(blob, /HELP/);
  assert.match(blob, /Message and data rates may apply/);
  assert.match(blob, /Message frequency varies/);
});
