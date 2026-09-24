import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  cardFeePillLabelKey,
  cardPhotoLicenseWarning,
  showCardLivePill,
} from "../src/lib/card-photo-pills.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("Live pill needs the live flag and KidEase approval together", () => {
  assert.equal(showCardLivePill(true, true), true);
  assert.equal(showCardLivePill(true, false), false);
  assert.equal(showCardLivePill(false, true), false);
  assert.equal(showCardLivePill(false, false), false);
});

test("$10 / Day is only the confirmed ten-a-day program", () => {
  assert.equal(cardFeePillLabelKey("badgeTen"), "cardTenPerDay");
  assert.equal(cardFeePillLabelKey("badgeFifteen"), "badgeFifteen");
  assert.equal(cardFeePillLabelKey("badgeReducedQc"), "badgeReducedQc");
  assert.equal(cardFeePillLabelKey(null), null);
});

test("photo overlay keeps expired and suspended, not registry-checked", () => {
  assert.equal(cardPhotoLicenseWarning("license_matched"), false);
  assert.equal(cardPhotoLicenseWarning("license_unverified"), false);
  assert.equal(cardPhotoLicenseWarning("license_expired"), true);
  assert.equal(cardPhotoLicenseWarning("license_suspended"), true);
  assert.equal(cardPhotoLicenseWarning(null), false);
});

test("listing card photo uses the live and fee pills instead of registry-checked", () => {
  const card = src("src/components/daycare-card.tsx");
  assert.match(card, /data-ke="card-live-pill"/);
  assert.match(card, /data-ke="card-fee-pill"/);
  assert.match(card, /showCardLivePill\(live, publicApprovalEligible\(item\)\)/);
  assert.match(card, /cardFeePillLabelKey\(feeBadge\)/);
  assert.match(card, /confirmedFeeProgramBadge/);
  assert.match(card, /cardPhotoLicenseWarning\(license\.id\)/);
  assert.doesNotMatch(card, /trustLicensedMatched/);
  assert.doesNotMatch(card, /listingPill/);
  const copy = src("src/lib/copy.ts");
  assert.match(copy, /cardTenPerDay: "\$10 \/ Day"/);
  assert.match(copy, /cardTenPerDay: "10 \$ \/ jour"/);
});
