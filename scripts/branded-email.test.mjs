import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { emailLocaleFor, renderBrandedEmail, renderBrandedText } from "../src/lib/email-layout.ts";
import { prepareMailBody, sendTransactionalMail } from "../src/lib/transactional-mail.ts";
import { isAdminOnlyListing } from "../src/lib/listing-visibility.ts";

const base = {
  locale: "en", preheader: "p", heading: "Your listing still needs a few facts",
  blocks: [{ kind: "list", items: ["<b>x</b>"] }],
  cta: { label: "Finish my listing", href: "https://www.kidease.ca/provider" },
  unsubscribeUrl: "https://www.kidease.ca/api/unsubscribe?token=t",
};
const input = { purpose: "host_action", to: "a@b.ca", subject: "s", text: "plain", html: "<p>plain</p>", unsubscribeUrl: base.unsubscribeUrl, branded: base };

test("layout: 600px, CTA, unsubscribe, dark mode, escaped, copy guardrails", () => {
  const h = renderBrandedEmail(base);
  for (const s of ['width="600"', "prefers-color-scheme: dark", "Finish my listing", "api/unsubscribe?token=t", "&lt;b&gt;x&lt;/b&gt;", "founding period"]) assert.ok(h.includes(s), s);
  assert.doesNotMatch(h, /free forever|GST|\d{7} Ontario|endorsed by/i);
});
test("layout: non-https CTA is neutralised", () => {
  assert.ok(!renderBrandedEmail({ ...base, cta: { label: "x", href: "javascript:alert(1)" } }).includes("javascript:"));
});
test("Quebec: French-first bilingual", () => {
  assert.equal(emailLocaleFor("en", "QC"), "fr-qc");
  const h = renderBrandedEmail({ ...base, locale: "fr-qc", heading: "Votre fiche", en: { heading: "Your listing", blocks: [] } });
  assert.ok(h.indexOf("Votre fiche") < h.indexOf("Your listing"));
  assert.ok(h.includes('lang="fr-CA"'));
});
test("plain-text fallback keeps CTA + unsubscribe", () => {
  const t = renderBrandedText(base);
  assert.ok(t.includes("https://www.kidease.ca/provider"));
  assert.ok(t.includes("Unsubscribe: " + base.unsubscribeUrl));
});
test("BRANDED_EMAILS off by default: body unchanged, no headers", async () => {
  const r = await prepareMailBody(input, {});
  assert.equal(r.html, "<p>plain</p>");
  assert.deepEqual(r.headers, {});
});
test("BRANDED_EMAILS on: branded html + one-click List-Unsubscribe", async () => {
  const r = await prepareMailBody(input, { BRANDED_EMAILS: "1" });
  assert.ok(r.html.includes('width="600"'));
  assert.equal(r.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.ok(r.headers["List-Unsubscribe"].includes(base.unsubscribeUrl));
});
test("never sends mail about a test listing", async () => {
  let called = 0;
  const r = await sendTransactionalMail({ ...input, aboutTestListing: true }, { env: { RESEND_API_KEY: "k" }, fetch: async () => { called++; return new Response("{}"); } });
  assert.equal(called, 0);
  assert.equal(r.status, "logged");
});
test("Resend payload carries headers + branded html when flag on", async () => {
  let body = {};
  await sendTransactionalMail(input, { env: { RESEND_API_KEY: "k", BRANDED_EMAILS: "1" }, fetch: async (_u, init) => { body = JSON.parse(String(init.body)); return new Response("{}", { status: 200 }); } });
  assert.equal(body.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.ok(String(body.html).includes("KidEase"));
});
test("QA fixture detection catches 'KidEase Test Daycare (QA)'", () => {
  assert.equal(isAdminOnlyListing({ name: "KidEase Test Daycare (QA)" }), true);
  assert.equal(isAdminOnlyListing({ name: "Real Centre", isTest: 1 }), true);
  assert.equal(isAdminOnlyListing({ name: "Sunny Days Child Care Centre", slug: "sunny-days" }), false);
  assert.equal(isAdminOnlyListing({ name: "Testa Family Daycare" }), false);
});

test("senders pass branded content and QA listings are guarded", () => {
  const read = (rel) => readFileSync(new URL("../" + rel, import.meta.url), "utf8");
  const branded = [
    "src/lib/server/host-action.ts",
    "src/lib/server/verify-mail.ts",
    "src/lib/server/two-factor.ts",
    "src/lib/server/reset-mail.ts",
    "src/lib/server/reset-password-mail.ts",
    "src/lib/server/claim-mail.ts",
    "src/lib/server/provider-onboard-mail.ts",
    "src/lib/server/invite-mail.ts",
    "src/lib/server/parent-tracker.ts",
    "src/lib/server/earnings-desk.ts",
    "src/lib/server/area-waitlist-job.ts",
    "src/lib/server/automation-mail.ts",
    "src/lib/server/unified-alerts.ts",
    "src/lib/server/wiring/runtime.ts",
    "src/lib/server/stripe-parent-invoices.ts",
    "src/lib/server/support-desk.ts",
    "src/lib/server/staff-scheduling.ts",
    "src/lib/server/coparent-email.ts",
    "src/lib/server/alert-dispatch.ts",
    "src/lib/server/open-spots-checkin.ts",
    "src/lib/server/spot-offers.ts",
    "src/lib/server/tour-reminders.ts",
    "src/lib/server/waitlist-tracker.ts",
    "src/lib/server/notify.ts",
    "src/lib/server/spot-alerts.ts",
    "src/lib/server/search-alerts.ts",
    "src/lib/server/admin-centres.ts",
  ];
  for (const file of branded) assert.match(read(file), /branded:/, file);
  for (const file of [
    "src/lib/server/spot-alerts.ts",
    "src/lib/server/search-alerts.ts",
    "src/lib/server/notify.ts",
    "src/lib/server/admin-centres.ts",
    "src/lib/server/admin-mail.ts",
    "src/lib/server/compliance-common.ts",
  ]) {
    assert.match(read(file), /prepareMailBody/, file);
  }
  for (const file of [
    "src/lib/server/notify.ts",
    "src/lib/server/open-spots-checkin.ts",
    "src/lib/server/spot-offers.ts",
    "src/lib/server/tour-reminders.ts",
    "src/lib/server/waitlist-tracker.ts",
    "src/lib/server/alert-dispatch.ts",
    "src/lib/server/spot-alerts.ts",
    "src/lib/server/staff-scheduling.ts",
    "src/lib/server/claim-mail.ts",
    "src/lib/server/invite-mail.ts",
    "src/lib/server/provider-onboard-mail.ts",
    "src/lib/server/area-waitlist-job.ts",
    "src/lib/server/stripe-parent-invoices.ts",
    "src/lib/server/search-alerts.ts",
  ]) {
    assert.match(read(file), /aboutTestListing|isAdminOnlyListing/, file);
  }
  const flags = read("src/lib/flags.ts");
  assert.match(flags, /BRANDED_EMAILS/);
  assert.doesNotMatch(flags, /"BRANDED_EMAILS"/);
});
