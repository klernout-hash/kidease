import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { presentAuthCopy } from "../src/lib/auth/present-auth-copy.ts";
import { tx } from "../src/lib/copy.ts";
import {
  REAUTH_REQUIRED_MESSAGE,
  REAUTH_WINDOW_MS,
  stepUpAllows,
  stepUpClass,
} from "../src/lib/reauth.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("licence upload step-up stays a 10-minute password or email-code confirm", () => {
  assert.equal(REAUTH_WINDOW_MS, 10 * 60 * 1000);
  assert.equal(stepUpClass("license_document"), "high");
  assert.equal(REAUTH_REQUIRED_MESSAGE, "Confirm it's you to continue.");
  const confirmedAt = 1_000_000;
  assert.equal(stepUpAllows({ class: "high", confirmedAtMs: confirmedAt, nowMs: confirmedAt + REAUTH_WINDOW_MS - 1 }), true);
  assert.equal(stepUpAllows({ class: "high", confirmedAtMs: confirmedAt, nowMs: confirmedAt + REAUTH_WINDOW_MS }), false);
  assert.equal(stepUpAllows({ class: "high", confirmedAtMs: null, nowMs: confirmedAt }), false);

  const license = src("src/routes/api/license-docs.$daycareId.ts");
  assert.match(license, /if \(actor === "admin"\)/);
  assert.match(license, /assertRecentReauth\(userId\)/);
  assert.match(src("src/lib/server/reauth.server.ts"), /function assertRecentReauth/);
  assert.match(src("src/lib/server/reauth.server.ts"), /isStepUpFresh\(userId, "high"\)/);
  assert.match(src("src/lib/server/reauth.ts"), /confirmReauthPassword/);
  assert.match(src("src/lib/server/reauth.ts"), /confirmReauthOtp/);
  assert.match(src("src/lib/server/reauth.server.ts"), /signReauthStamp/);
});

test("daycare licence desk keeps the file and opens the existing confirm dialog", () => {
  const forms = src("src/components/provider-listing-forms.tsx");
  assert.match(forms, /useReauthPrompt/);
  assert.match(forms, /isReauthRequiredMessage/);
  assert.match(forms, /setPendingLicense\(file\)/);
  assert.match(forms, /data-ke="licence-reauth"/);
  assert.match(forms, /data-ke="licence-file"/);
  assert.match(forms, /t\("reauthTitle"\)/);
  assert.match(forms, /t\("reauthRequired"\)/);
  assert.match(forms, /t\("reauthKeptFile"\)/);
  assert.match(forms, /t\("licenceUploadLead"\)/);
  assert.match(forms, /promptForLicence/);
  assert.match(forms, /await sendLicence\(file\)/);
  assert.doesNotMatch(forms, /Upload a clear photo or PDF scan/);
  assert.doesNotMatch(forms, /<script/);
  assert.doesNotMatch(forms, /dangerouslySetInnerHTML/);
  const formClose = forms.lastIndexOf("</form>");
  assert.ok(formClose > 0);
  assert.ok(forms.indexOf("{reauth.dialog}") > formClose);
  assert.equal(tx("en", "reauthTitle"), "Confirm it's you");
  assert.equal(tx("en", "reauthRequired"), REAUTH_REQUIRED_MESSAGE);
  assert.equal(presentAuthCopy("en", REAUTH_REQUIRED_MESSAGE), REAUTH_REQUIRED_MESSAGE);
  assert.equal(presentAuthCopy("fr", REAUTH_REQUIRED_MESSAGE), tx("fr", "reauthRequired"));
  assert.equal(tx("fr", "reauthTitle"), "Confirmez que c’est vous");
  assert.doesNotMatch(tx("fr", "reauthRequired"), /Confirm it's you/);
  assert.doesNotMatch(tx("fr", "reauthKeptFile"), /Your file|Confirm, then/);
  assert.doesNotMatch(tx("fr", "licenceUploadLead"), /Upload a clear photo/);
  assert.match(tx("fr", "licenceUploadLead"), /permis provincial/);
});

test("owner screening upload is not step-up gated, and a confirm error still has a way through", () => {
  const route = src("src/routes/api/screening-documents.ts");
  assert.doesNotMatch(route, /assertRecentReauth|assertGraceReauth/);
  const screening = src("src/components/provider-screening.tsx");
  assert.match(screening, /data-ke="screening-reauth"/);
  assert.match(screening, /useReauthPrompt/);
  assert.match(screening, /isReauthRequiredMessage/);
  assert.match(screening, /setPendingUpload\(pending\)/);
  assert.match(screening, /t\("reauthTitle"\)/);
  assert.doesNotMatch(screening, /<script/);
  const review = src("src/lib/server/provider-screening.ts");
  assert.match(review, /export const reviewScreeningDocument/);
  assert.match(review, /assertRecentReauth\(context\.userId\)/);
  assert.match(src("src/components/admin-screening.tsx"), /withReauth/);
});

test("other step-up endpoints already open the confirm dialog", () => {
  const pairs = [
    ["src/lib/server/admin-centres.ts", "src/routes/admin.tsx"],
    ["src/lib/server/trust.ts", "src/routes/admin.tsx"],
    ["src/lib/server/contracts.ts", "src/components/admin-contracts.tsx"],
    ["src/lib/server/reviews.ts", "src/components/admin-reviews.tsx"],
    ["src/components/admin-review-card.tsx", "src/components/admin-review-card.tsx"],
  ];
  for (const [server, ui] of pairs) {
    assert.match(src(server), /assertRecentReauth|withReauth/);
    assert.match(src(ui), /withReauth/);
  }
  assert.match(src("src/lib/server/reprocess-listing-photos.ts"), /assertGraceReauth/);
  assert.doesNotMatch(src("src/lib/server/reprocess-listing-photos.ts"), /assertRecentReauth/);
  assert.match(src("src/routes/admin.tsx"), /withReauth/);
  assert.match(src("src/components/account-security.tsx"), /ReauthDialog/);
  assert.match(src("src/components/account-security.tsx"), /isReauthRequiredMessage/);
});
