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

test("English and French legal pages use the store commerce gate", () => {
  for (const page of ["privacy", "terms", "fr.privacy", "fr.terms"]) {
    const source = readFileSync(join(root, `src/routes/${page}.tsx`), "utf8");
    assert.match(source, /const hideCommerce = useStoreShell\(\)/);
    assert.match(source, /hideCommerce \? legalDocWithoutStorePurchase\(raw\) : raw/);
  }
});

test("legal SMS copy describes express consent and how to withdraw", async () => {
  const { SMS_PRIVACY_FR, SMS_TERMS_FR } = await import("../src/lib/sms-legal.ts");
  for (const section of [SMS_PRIVACY_EN, SMS_TERMS_EN, SMS_PRIVACY_FR, SMS_TERMS_FR]) {
    const copy = JSON.stringify(section);
    assert.match(copy, /KidEase \(Winnipeg, Manitoba\)/);
    assert.match(copy, /express consent|consentement exprès/);
    assert.match(copy, /STOP/);
    assert.match(copy, /ARRÊT/);
    assert.match(copy, /support@kidease.ca/);
    assert.match(copy, /rates may apply|frais de messagerie et de données/);
    assert.doesNotMatch(copy, /autodialer|composeur automatique|purchasing a plan/);
  }
});

test("store legal filter removes subscription offers while retaining ordinary text", async () => {
  const { legalDocWithoutStorePurchase } = await import("../src/lib/store-purchase-copy.ts");
  const doc = { intro: ["Compare our paid plans.", "Choisissez un abonnement.", "Contact KidEase."], sections: [SMS_PRIVACY_FR_FIXTURE()] };
  assert.deepEqual(legalDocWithoutStorePurchase(doc).intro, ["Contact KidEase."]);
  assert.equal(legalDocWithoutStorePurchase(doc).sections[0].id, "sms");
  assert.equal(doc.intro.length, 3);
});

function SMS_PRIVACY_FR_FIXTURE() {
  return { id: "sms", title: "Textos", blocks: [{ type: "p", text: "Écrivez à support@kidease.ca." }] };
}
