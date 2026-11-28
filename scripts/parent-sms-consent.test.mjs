import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  PARENT_SMS_CONSENT_TEXT,
  PARENT_SMS_TERMS_URL,
  parentMobileIssue,
  parentSmsOptInInput,
} from "../src/lib/parent-sms-consent.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("parent SMS opt-in identifies KidEase and explains how to withdraw", () => {
  assert.match(PARENT_SMS_CONSENT_TEXT, /I agree.*KidEase.*rates may apply.*Withdraw consent.*STOP.*support@kidease.ca/);
  assert.equal(PARENT_SMS_TERMS_URL, "https://www.kidease.ca/terms");
  const fields = src("src/components/parent-sms-fields.tsx");
  assert.match(fields, /parentSmsConsentText/);
  assert.match(fields, /href=\{PARENT_SMS_TERMS_URL\}/);
  assert.match(fields, /to="\/privacy"/);
  assert.match(fields, /checked=\{consent\}/);
  assert.doesNotMatch(fields, /required/);
  assert.doesNotMatch(fields, /defaultChecked/);
  assert.doesNotMatch(fields, /United States|\bstate\b|\bzip code\b|cell phone/i);
});

test("phone and consent are optional on the parent record", () => {
  assert.equal(parentMobileIssue(""), null);
  assert.equal(parentMobileIssue("   "), null);
  assert.equal(parentMobileIssue("204-555-0100"), null);
  assert.equal(parentMobileIssue("(204) 555-0100"), null);
  assert.equal(parentMobileIssue("abc"), null);
  assert.match(parentMobileIssue("204-555") || "", /leave this blank/);
  assert.deepEqual(parentSmsOptInInput({}), { phone: "", smsConsent: false, issue: null });
  assert.deepEqual(parentSmsOptInInput({ phone: "2045550100", smsConsent: false }), {
    phone: "2045550100",
    smsConsent: false,
    issue: null,
  });
  assert.equal(parentSmsOptInInput({ smsConsent: true }).smsConsent, true);
  assert.equal(parentSmsOptInInput({ smsConsent: "yes" }).smsConsent, false);
});

test("sign-up pages show the logo, phone field, and consent, and the schema stores them", () => {
  const signup = src("src/routes/signup.tsx");
  const parentSignup = src("src/routes/parent.signup.tsx");
  const form = src("src/components/parent-signup-form.tsx");
  const server = src("src/lib/server/parent-sms-consent.ts");
  const migration = src("migrations/0086_parent_sms_consent.sql");
  const guard = src("scripts/request-guard.mjs");
  const vercel = src("vercel.json");
  assert.match(signup, /loadSignInProviders/);
  assert.match(parentSignup, /loadSignInProviders/);
  assert.match(src("src/routes/fr.signup.tsx"), /loadSignInProviders/);
  assert.match(form, /socialSignupCallbackPath/);
  assert.match(form, /role: "parent"/);
  assert.match(form, /stashParentSmsOptIn/);
  assert.match(form, /BrandMark/);
  assert.match(form, /useState\(false\)/);
  assert.match(form, /ParentSmsFields/);
  assert.match(form, /saveParentSmsOptIn/);
  assert.match(server, /sms_consent/);
  assert.match(server, /sms_consent_at/);
  assert.match(server, /parentSmsConsentText/);
  assert.match(migration, /sms_consent/);
  assert.match(migration, /sms_consent_at/);
  assert.match(guard, /"\/sign-up": "\/signup"/);
  assert.doesNotMatch(guard, /"\/signup": "/);
  assert.match(vercel, /"source": "\/sign-up"/);
  assert.match(vercel, /"destination": "\/signup"/);
  assert.doesNotMatch(vercel, /"source": "\/signup"/);
  assert.match(src("src/routes/login.tsx"), /ParentSmsFields/);
  assert.match(src("src/routes/parent.tsx"), /\/parent\/signup/);
});
