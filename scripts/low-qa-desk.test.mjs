import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { activityKindChipLabel } from "../src/lib/account-notify.ts";
import { DESK_NAV, readDeskGroupOpen } from "../src/lib/desk-nav.ts";
import { screeningPublicNotes, screeningPublicStatus } from "../src/lib/provider-screening.ts";
import { tx } from "../src/lib/copy.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("settings links open alerts, login, and email choices", () => {
  for (const desk of ["admin", "daycare", "parent"]) {
    const items = DESK_NAV[desk];
    const notify = items.find((item) => item.id === "notify-prefs");
    const security = items.find((item) => item.id === "security");
    const email = items.find((item) => item.id === "email-sms");
    assert.equal(notify?.href, "/account");
    assert.equal(notify?.search?.section, "alerts");
    assert.equal(security?.search?.section, "security");
    assert.equal(email?.href, "/account");
    assert.equal(email?.search?.section, "email-sms");
    assert.notEqual(email?.href, "/unsubscribe");
    assert.notEqual(notify?.href, "/notifications");
  }
});

test("daycare today names the founding period, never free forever", () => {
  const provider = src("src/routes/provider.tsx");
  assert.match(provider, /FOUNDING_PAGE\[foundingLocale\(locale\)\]\.daycarePill/);
  assert.doesNotMatch(provider, /:\s*"Free"/);
  assert.doesNotMatch(src("src/lib/founding-period.ts"), /free forever/i);
  assert.equal(tx("en", "heroTrustFounding"), "Free founding period");
});

test("pay copy does not point at a missing Parent Plus block", () => {
  assert.match(tx("en", "noPaymentsLead"), /it is not a centre bill/);
  assert.doesNotMatch(tx("en", "noPaymentsLead"), /Parent Plus, above/i);
  assert.doesNotMatch(tx("fr", "noPaymentsLead"), /ci-dessus/i);
  assert.match(src("src/components/parent-desk.tsx"), /t\("openBills"\)/);
  assert.doesNotMatch(src("src/components/parent-desk.tsx"), /connectFeeParentPay/);
  assert.match(src("src/routes/pay.tsx"), /Pay a centre bill/);
});

test("screening hides stub copy and undated cleared files", () => {
  assert.doesNotMatch(screeningPublicNotes("Stub pack: VSC required"), /^Stub pack/i);
  assert.equal(screeningPublicStatus({ status: "cleared", issuedOn: "", expiresOn: null }), "uploaded");
  assert.equal(
    screeningPublicStatus({ status: "cleared", issuedOn: "2024-01-01", expiresOn: "2027-01-01" }),
    "cleared",
  );
  assert.doesNotMatch(src("src/components/provider-screening.tsx"), /screeningPackStub/);
});

test("signed-in daily care does not talk to guests", () => {
  assert.doesNotMatch(tx("en", "careNoEnrolledLead"), /Guests can still browse/i);
});

test("feature-off pages share one sentence", () => {
  const frame = src("src/components/admin-tool-frame.tsx");
  assert.match(frame, /t\("adminToolOff"\)/);
  assert.equal(tx("en", "adminToolOff"), "This tool is off. Nothing changes until it is turned on.");
});

test("system activity chips are words, not raw ids", () => {
  assert.equal(activityKindChipLabel("money"), "Bills");
  assert.equal(activityKindChipLabel("signup"), "Daycare providers");
  assert.equal(activityKindChipLabel("photo_check"), "Photo Check");
});

test("how it works is a page, and empty compare or report search is omitted", () => {
  const vercel = src("vercel.json");
  assert.doesNotMatch(vercel, /"source": "\/how-it-works"/);
  assert.match(src("src/routes/compare.tsx"), /return slugs\.length \? \{ slugs \} : \{\}/);
  assert.match(src("src/routes/report.tsx"), /return province \? \{ province \} : \{\}/);
  assert.equal(readDeskGroupOpen("admin", "missing", true), true);
});

test("claim keeps one find form open and the enrol form opens from the hash", () => {
  const claim = src("src/routes/claim.tsx");
  assert.match(claim, /<details id="enroll"/);
  assert.match(claim, /el instanceof HTMLDetailsElement\) el\.open = true/);
  assert.match(claim, /data-ke="claim-license-file"/);
  assert.match(claim, /file:min-h-11/);
});
