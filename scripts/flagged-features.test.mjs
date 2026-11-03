import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { FEATURE_COPY_KEYS, featureCopy } from "../src/lib/flagged-feature-copy.ts";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { ageOpenSpotsEnabled, childCheckinEnabled, taxReceiptsEnabled, unifiedInboxEnabled } from "../src/lib/features.ts";
import { SHIPPED_LOCALES } from "../src/lib/languages.ts";
import { checkoutAllowed, matchOpenSpotParent, nextDoorAction, openSpotChannels } from "../src/lib/gap-features.ts";
import { isOrphanInboxId, mergeUnifiedInbox } from "../src/lib/desk-features.ts";
import {
  buildTaxReceiptGroups,
  cadFromCents,
  federalReceiptLines,
  rl24ReceiptLines,
  taxReceiptPdf,
} from "../src/lib/tax-receipts.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

const paid = (extra) => ({
  id: "inv-1",
  status: "paid",
  amountCents: 120000,
  paidAt: "2026-03-15",
  period: "2026-03",
  daycareId: "day-on",
  daycareName: "Harbour Centre",
  province: "ON",
  address: "100 King St",
  city: "Toronto",
  postalCode: "M5X 1A9",
  licenseNumber: "ON-100",
  childId: "child-1",
  childName: "Amina",
  childBirthdate: "2022-05-04",
  parentUserId: "parent-1",
  parentName: "Nguyen family",
  ...extra,
});

test("the four flags stay off until each one is set", () => {
  for (const key of ["FEATURE_AGE_OPEN_SPOTS", "FEATURE_UNIFIED_INBOX", "FEATURE_CHILD_CHECKIN", "FEATURE_TAX_RECEIPTS"]) {
    assert.equal(FLAG_DEFAULTS[key], false, key);
    assert.match(src(".env.example"), new RegExp(`^${key}=0$`, "m"));
    assert.doesNotMatch(src(".env.example"), new RegExp(`^${key}=1$`, "m"));
  }
  assert.equal(ageOpenSpotsEnabled({}), false);
  assert.equal(unifiedInboxEnabled({}), false);
  assert.equal(childCheckinEnabled({}), false);
  assert.equal(taxReceiptsEnabled({}), false);
  assert.equal(ageOpenSpotsEnabled({ FEATURE_AGE_OPEN_SPOTS: "1" }), true);
  assert.equal(unifiedInboxEnabled({ FEATURE_UNIFIED_INBOX: "1" }), true);
  assert.equal(childCheckinEnabled({ FEATURE_CHILD_CHECKIN: "1" }), true);
  assert.equal(taxReceiptsEnabled({ FEATURE_TAX_RECEIPTS: "1" }), true);
});

test("age spots match a saved family and do not send on their own", () => {
  assert.equal(
    matchOpenSpotParent("toddler", { userId: "p", waitlistAge: null, interestAge: null, saved: true, searchAges: ["toddler"] }),
    "saved",
  );
  assert.equal(
    matchOpenSpotParent("infant", { userId: "p", waitlistAge: "school-age", interestAge: null, saved: true, searchAges: [] }),
    null,
  );
  assert.deepEqual(openSpotChannels({ featureOn: true, mailOn: false, pushOn: false }), { inApp: true, mail: false, push: false });
  assert.deepEqual(openSpotChannels({ featureOn: false, mailOn: true, pushOn: true }), { inApp: false, mail: false, push: false });
  const file = src("src/lib/server/open-spot-posts.ts");
  assert.match(file, /openSpotAlertsEnabled/);
  assert.doesNotMatch(file, /notifyConsentedUserSms|sendTransactionalMail/);
  assert.match(src("src/components/age-open-spots-desk.tsx"), /featureCopy/);
});

test("unified inbox adds a request with no thread and keeps phone off the row", () => {
  const merged = mergeUnifiedInbox(
    [],
    [
      {
        id: "ld_new",
        conversationId: null,
        parentName: "New Parent",
        message: "We need care",
        kind: "waitlist",
        status: "requested",
        createdAt: "2026-11-02T14:00:00.000Z",
        daycareId: "d1",
        daycareName: "Maple",
      },
    ],
    [],
  );
  assert.equal(merged.length, 1);
  assert.equal(isOrphanInboxId(merged[0].id), true);
  assert.equal(merged[0].phone, null);
  const inbox = src("src/components/centre-inbox.tsx");
  assert.match(inbox, /featureCopy/);
  assert.match(inbox, /mergeUnifiedInbox/);
  assert.doesNotMatch(inbox, /notifyConsentedUserSms|sendTransactionalMail/);
});

test("check-in alternates arrival and pickup and does not store a photo", () => {
  assert.equal(nextDoorAction(null), "check_in");
  assert.equal(nextDoorAction("check_in"), "check_out");
  assert.equal(nextDoorAction("check_out"), "check_in");
  assert.equal(checkoutAllowed("Sam Lee", []).ok, true);
  assert.deepEqual(checkoutAllowed("", [{ name: "Sam Lee" }]), { ok: false, reason: "need_pickup" });
  assert.equal(checkoutAllowed("Sam Lee", [{ name: "Sam Lee" }]).ok, true);
  assert.deepEqual(checkoutAllowed("Other", [{ name: "Sam Lee" }]), { ok: false, reason: "not_authorized" });
  const file = src("src/lib/server/child-checkin.ts");
  assert.match(file, /childCheckinEnabled/);
  assert.doesNotMatch(file, /photo|notifyConsentedUserSms|sendTransactionalMail/i);
  assert.match(src("src/components/child-checkin-desk.tsx"), /featureCopy/);
});

test("tax receipts sum paid invoices only and build both PDFs", () => {
  const { groups, years, truncated } = buildTaxReceiptGroups({
    invoices: [
      paid({}),
      paid({ id: "inv-dup", stripeInvoiceId: "in_1", amountCents: 5000 }),
      paid({ id: "inv-1b", stripeInvoiceId: "in_1", amountCents: 5000 }),
      paid({ id: "inv-open", status: "sent", amountCents: 99900 }),
      paid({ id: "inv-usd", currency: "usd", amountCents: 40000 }),
      paid({ id: "inv-zero", amountCents: 0 }),
      paid({
        id: "inv-qc",
        amountCents: null,
        totalDollars: 80,
        daycareId: "day-qc",
        daycareName: "Garderie Sud",
        province: "QC",
        licenseNumber: "",
        period: "2026-04",
        paidAt: "2026-04-02",
        stripeInvoiceId: null,
      }),
    ],
    careDays: [
      { daycareId: "day-qc", parentUserId: "parent-1", childName: "Amina", day: "2026-04-02" },
      { daycareId: "day-qc", parentUserId: "parent-1", childName: "amina", day: "2026-04-03" },
      { daycareId: "day-qc", parentUserId: "parent-1", childName: "Amina", day: "2026-04-03" },
    ],
  });
  assert.equal(truncated, false);
  assert.deepEqual(years, [2026]);
  const ontario = groups.find((group) => group.province === "ON");
  const quebec = groups.find((group) => group.province === "QC");
  assert.ok(ontario);
  assert.ok(quebec);
  assert.equal(ontario.amountCents, 125000);
  assert.equal(cadFromCents(ontario.amountCents), "$1,250.00");
  assert.equal(quebec.amountCents, 8000);
  assert.equal(quebec.daysOfCare, 2);
  assert.equal(ontario.daysOfCare, null);
  const federal = federalReceiptLines(ontario).join("\n");
  assert.match(federal, /Ontario and federal child care receipt/);
  assert.match(federal, /Amount: \$1,250\.00/);
  assert.match(federal, /Provider identification: ON-100/);
  assert.doesNotMatch(federal, /\$999|social insurance number: \d/i);
  assert.equal(rl24ReceiptLines(ontario), null);
  const rl = rl24ReceiptLines(quebec);
  assert.ok(rl);
  const slip = rl.join("\n");
  assert.match(slip, /C Total paid: \$80\.00/);
  assert.match(slip, /B\.1 Days of care: 2/);
  assert.match(slip, /A Date of birth: 2022-05-04/);
  assert.match(slip, /H Provider identification: \(not on file\)/);
  assert.match(slip, /E Qualifies for the credit: \(not on file\)/);
  assert.match(slip, /G Social insurance number: \(not stored\)/);
  assert.doesNotMatch(slip, /\b\d{3}[- ]?\d{3}[- ]?\d{3}\b/);
  const pdf = taxReceiptPdf(ontario, "federal");
  assert.ok(pdf);
  const bytes = Buffer.from(pdf).toString("latin1");
  assert.match(bytes, /%PDF-1\.4/);
  assert.match(bytes, /\$1,250\.00/);
  const rlPdf = taxReceiptPdf(quebec, "rl24");
  assert.ok(rlPdf);
  assert.match(Buffer.from(rlPdf).toString("latin1"), /\$80\.00/);
  assert.equal(taxReceiptPdf(ontario, "rl24"), null);
  const capped = buildTaxReceiptGroups({ invoices: [paid({})], capped: true });
  assert.equal(capped.truncated, true);
  assert.equal(capped.groups.length, 0);
  const server = src("src/lib/server/tax-receipts.ts");
  assert.match(server, /taxReceiptsEnabled/);
  assert.match(server, /status = 'paid'/);
  assert.doesNotMatch(server, /daycare_fee_invoices|sendTransactionalMail|notifyConsentedUserSms|infant_monthly/);
});

test("the four features have copy in all 10 languages", () => {
  assert.equal(SHIPPED_LOCALES.length, 10);
  const english = featureCopy("en");
  for (const code of SHIPPED_LOCALES) {
    const pack = featureCopy(code);
    for (const key of FEATURE_COPY_KEYS) {
      assert.equal(typeof pack[key], "string", `${code}.${key}`);
      assert.ok(pack[key].trim(), `${code}.${key}`);
    }
    if (code !== "en") {
      assert.notEqual(pack.taxTitle, english.taxTitle, code);
      assert.notEqual(pack.spotsTitle, english.spotsTitle, code);
      assert.notEqual(pack.checkTitle, english.checkTitle, code);
      assert.notEqual(pack.inboxNoThread, english.inboxNoThread, code);
    }
  }
  assert.equal(featureCopy("xx").taxTitle, english.taxTitle);
});
