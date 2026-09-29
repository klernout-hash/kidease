import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { SMS_PRIVACY_EN, SMS_TERMS_EN, SMS_TWILIO_REQUIRED } from "../src/lib/sms-legal.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("privacy and terms pages attach the SMS section", () => {
  const privacy = readFileSync(join(root, "src/routes/privacy.tsx"), "utf8");
  const terms = readFileSync(join(root, "src/routes/terms.tsx"), "utf8");
  assert.match(privacy, /withSmsSection/);
  assert.match(privacy, /SMS_PRIVACY_EN/);
  assert.match(terms, /SMS_TERMS_EN/);
});

test("Twilio exact no-share sentence is on privacy and terms", () => {
  assert.equal(
    SMS_TWILIO_REQUIRED,
    "All the above categories exclude text messaging originator opt-in data and consent; this information won't be shared with any third parties.",
  );
  const blob = JSON.stringify(SMS_PRIVACY_EN) + JSON.stringify(SMS_TERMS_EN);
  assert.equal(blob.includes(SMS_TWILIO_REQUIRED), true);
  assert.match(blob, /STOP/);
  assert.match(blob, /HELP/);
  assert.match(blob, /Message and data rates may apply/);
});
