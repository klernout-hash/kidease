import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  applyLocalRegistryTrust,
  localCatalogMatchIds,
  persistLocalLicenseMatches,
  PERSIST_LOCAL_LICENSE_SQL,
} from "../src/lib/server/license-match.ts";
import { isVerifiedLicensed, publicLicenseBadge } from "../src/lib/license-verify.ts";
import { licenseBadge, trustBadgesFor } from "../src/lib/trust.ts";
import { listingPill } from "../src/lib/listing-card.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("Manitoba catalogue numbers become Licensed; other provinces stay unverified", () => {
  const mb = applyLocalRegistryTrust({
    id: "mb-1001",
    province: "MB",
    licenseNumber: "MB-1001",
    licenseStatus: "unverified",
    registryMatchState: "unmatched",
  });
  assert.equal(mb.licenseStatus, "matched");
  assert.equal(mb.registryMatchState, "matched");
  assert.equal(mb.licenseVerificationSource, "local_catalog");
  assert.equal(mb.licenseNumber, "MB-1001");
  assert.equal(isVerifiedLicensed(mb), true);
  assert.equal(publicLicenseBadge(mb)?.id, "license_matched");
  assert.equal(licenseBadge(mb).labelKey, "trustLicensedMatched");
  assert.equal(licenseBadge(mb).tipKey, "trustLicensedMatchedMbTip");

  const on = applyLocalRegistryTrust({
    id: "on-1",
    province: "ON",
    licenseNumber: "1234567",
    licenseStatus: "unverified",
    registryMatchState: "unmatched",
  });
  assert.equal(on.licenseStatus, "unverified");
  assert.equal(on.registryMatchState, "unmatched");
  assert.equal(isVerifiedLicensed(on), false);
  assert.equal(publicLicenseBadge(on), null);
});

test("never invents a licence number and never overrides expired, suspended, or mismatch", () => {
  const blank = applyLocalRegistryTrust({
    id: "mb-blank",
    province: "MB",
    licenseNumber: "",
    licenseStatus: "unverified",
    registryMatchState: "unmatched",
  });
  assert.equal(blank.licenseNumber, "");
  assert.equal(blank.licenseStatus, "unverified");
  assert.equal(isVerifiedLicensed(blank), false);

  const expired = applyLocalRegistryTrust({
    id: "mb-1001",
    province: "MB",
    licenseNumber: "MB-1001",
    licenseStatus: "expired",
    registryMatchState: "unmatched",
  });
  assert.equal(expired.licenseStatus, "expired");
  assert.equal(publicLicenseBadge(expired)?.id, "license_expired");

  const mismatch = applyLocalRegistryTrust({
    id: "mb-1001",
    province: "MB",
    licenseNumber: "MB-1001",
    licenseStatus: "unverified",
    registryMatchState: "mismatch",
  });
  assert.equal(mismatch.registryMatchState, "mismatch");
  assert.equal(isVerifiedLicensed(mismatch), false);
});

test("parent cards omit Unverified and listing pills do not fake Licensed", () => {
  const unverified = { province: "ON", licenseStatus: "unverified", registryMatchState: "unmatched", live: false };
  assert.equal(
    trustBadgesFor(unverified, "card").some((b) => b.id.startsWith("license_")),
    false,
  );
  assert.equal(listingPill(unverified), null);

  const matched = applyLocalRegistryTrust({
    province: "MB",
    licenseNumber: "MB-1001",
    licenseStatus: "unverified",
    live: false,
  });
  assert.equal(trustBadgesFor(matched, "card")[0]?.id, "license_matched");
  assert.equal(listingPill(matched)?.labelKey, "badgeTen");
  assert.equal(listingPill({ ...matched, province: "BC" })?.labelKey, "trustLicensedMatched");
});

test("seed persist only writes matched ids and never touches claimed or expired rows", () => {
  const ids = localCatalogMatchIds([
    { id: "mb-1001", province: "MB", licenseNumber: "MB-1001" },
    { id: "on-1", province: "ON", licenseNumber: "1234567" },
  ]);
  assert.deepEqual(ids, ["mb-1001"]);
  assert.match(PERSIST_LOCAL_LICENSE_SQL, /claimed_at is null/);
  assert.match(PERSIST_LOCAL_LICENSE_SQL, /license_status not in \('expired', 'suspended', 'matched'\)/);
  assert.match(PERSIST_LOCAL_LICENSE_SQL, /registry_match_state <> 'mismatch'/);
  assert.doesNotMatch(PERSIST_LOCAL_LICENSE_SQL, /license_number =/);
});

test("persist helper no-ops on an empty id list", async () => {
  let called = 0;
  const n = await persistLocalLicenseMatches(
    {
      query: async () => {
        called += 1;
      },
    },
    [],
  );
  assert.equal(n, 0);
  assert.equal(called, 0);
});

test("UI and docs stay honest: tooltip, aria, no scrape on listing load", () => {
  const card = src("src/components/daycare-card.tsx");
  const listing = src("src/routes/daycare.$slug.tsx");
  const badge = src("src/components/trust-badge.tsx");
  const daycares = src("src/lib/server/daycares.ts");
  const nearby = src("src/lib/server/nearby.ts");
  const adapters = src("src/lib/server/registry-adapters.ts");
  const docs = src("docs/licensing.md");

  assert.match(card, /publicLicenseBadge/);
  assert.match(card, /TrustBadge/);
  assert.match(listing, /publicLicenseBadge/);
  assert.match(listing, /TrustBadge/);
  assert.match(badge, /data-license-badge/);
  assert.match(badge, /aria-label/);
  assert.match(badge, /title=\{tip\}/);
  assert.match(daycares, /applyLocalRegistryTrust/);
  assert.match(src("src/lib/server/map-row.ts"), /applyLocalRegistryTrust/);
  assert.doesNotMatch(daycares, /childcaresearch\.gov\.mb\.ca/);
  assert.doesNotMatch(nearby, /childcaresearch\.gov\.mb\.ca/);
  assert.match(adapters, /Not a live scrape/);
  assert.doesNotMatch(adapters, /cheerio|puppeteer|playwright\.chromium/);
  assert.match(docs, /Extending to another province/);
  assert.match(docs, /Do not scrape/);
  assert.match(docs, /Never invents a licence number|never invents a licence number/i);
  assert.match(src("docs/catalog-source.md"), /licensing\.md/);
  assert.match(src("src/lib/copy.ts"), /trustLicensedMatched: "Licensed"/);
  assert.match(src("src/lib/copy.ts"), /trustLicensedMatchedMbTip/);
  assert.match(src("src/lib/catalog-seed.ts"), /persistLocalLicenseMatches/);
});
