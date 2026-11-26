import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("combined release: manual bill reminder uses the polished template and only promises online pay when pay buttons are on", () => {
  const billing = src("src/lib/server/billing.ts");
  const fn = billing.slice(billing.indexOf("export const sendBillReminder"), billing.indexOf("export const voidBill"));
  assert.match(fn, /billReminderEmail\(/);
  assert.match(fn, /payOnline: showPayCtas\(\)/);
  assert.ok(!fn.includes("manualInvoiceReminderLetter"));
});

test("combined release: withdrawal notice and cancellation use the polished EN/FR templates", () => {
  const w = src("src/lib/server/wiring/withdrawal.ts");
  assert.match(w, /withdrawalNoticeEmail\(facts\)/);
  assert.match(w, /withdrawalNoticeSms\(facts\)/);
  assert.match(w, /withdrawalCancelledEmail\(\{ locale, \.\.\.people, lastDay \}\)/);
});

test("combined release: every public form passes the page language so the auto-reply matches it", () => {
  const notify = src("src/lib/server/notify.ts");
  assert.match(notify, /sendVisitorAutoReply\(data\.email, data\.name, data\.locale\)/);
  assert.match(notify, /contactAutoReplyEmail\(\{ locale, name \}\)/);
  for (const file of ["src/routes/contact.tsx", "src/routes/help.tsx", "src/routes/report.tsx", "src/components/jobs-interest-form.tsx", "src/components/listing-contact.tsx"]) {
    assert.match(src(file), /locale: (locale === "fr"|fr) \? "fr" : "en"/, file);
  }
});
