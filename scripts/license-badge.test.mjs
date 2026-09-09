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

  const on = applyLocalRegistryTrust({
    id: "on-1",
    province: "ON",
    licenseNumber: "1234567",
    licenseStatus: "unverified",
    registryMatchState: "unmatched",
  });
  assert.equal(on.licenseStatus, "unverified");
  assert.equal(on.registryMatchState, "unmatched");

  for (const province of ["AB", "BC", "SK", "QC"]) {
    const row = applyLocalRegistryTrust({
      id: `${province.toLowerCase()}-1`,
      province,
      licenseNumber: "FAKE-LICENCE-1",
      licenseStatus: "unverified",
      registryMatchState: "unmatched",
    });
    assert.equal(row.licenseStatus, "unverified", province);
    assert.equal(row.registryMatchState, "unmatched", province);
    assert.equal(row.licenseNumber, "FAKE-LICENCE-1", province);
  }
});

test("stub provinces fail closed even when stored as matched without operator review", () => {
  const leftover = applyLocalRegistryTrust({
    id: "on-stale",
    province: "ON",
    licenseNumber: "1234567",
    licenseStatus: "matched",
    registryMatchState: "matched",
  });
  assert.equal(leftover.licenseStatus, "unverified");
  assert.equal(leftover.registryMatchState, "unmatched");

  const reviewed = applyLocalRegistryTrust({
    id: "on-reviewed",
    province: "ON",
    licenseNumber: "1234567",
    licenseStatus: "matched",
    registryMatchState: "matched",
    licenseVerificationSource: "admin",
  });
  assert.equal(reviewed.licenseStatus, "matched");
  assert.equal(reviewed.registryMatchState, "matched");
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

  const expired = applyLocalRegistryTrust({
    id: "mb-1001",
    province: "MB",
    licenseNumber: "MB-1001",
    licenseStatus: "expired",
    registryMatchState: "unmatched",
  });
  assert.equal(expired.licenseStatus, "expired");

  const mismatch = applyLocalRegistryTrust({
    id: "mb-1001",
    province: "MB",
    licenseNumber: "MB-1001",
    licenseStatus: "unverified",
    registryMatchState: "mismatch",
  });
  assert.equal(mismatch.registryMatchState, "mismatch");
  assert.equal(mismatch.licenseStatus, "unverified");
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
  const trust = src("src/lib/trust.ts");
  const pill = src("src/lib/listing-card.ts");
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
  assert.match(trust, /license\.id === "license_unverified"/);
  assert.match(pill, /license\.id === "license_unverified"/);
  assert.match(daycares, /applyLocalRegistryTrust/);
  assert.match(src("src/lib/server/map-row.ts"), /applyLocalRegistryTrust/);
  assert.doesNotMatch(daycares, /childcaresearch\.gov\.mb\.ca/);
  assert.doesNotMatch(nearby, /childcaresearch\.gov\.mb\.ca/);
  assert.match(adapters, /Not a live scrape/);
  assert.doesNotMatch(adapters, /cheerio|puppeteer|playwright\.chromium/);
  assert.match(docs, /Extending to another province/);
  assert.match(docs, /Do not scrape/);
  assert.match(docs, /never invents a licence number/i);
  assert.match(src("docs/catalog-source.md"), /licensing\.md/);
  assert.match(src("src/lib/copy.ts"), /trustCatalogueMatched: "Catalogue-matched"/);
  assert.match(src("src/lib/copy.ts"), /trustLicensedMatched: "Registry-checked"/);
  assert.match(src("src/lib/copy.ts"), /trustLicensedMatchedMbTip/);
  assert.match(src("src/lib/catalog-seed.ts"), /persistLocalLicenseMatches/);
});

test("guest Explore cards hide Catalogue-matched and keep high-contrast titles", () => {
  const trust = src("src/lib/trust.ts");
  assert.match(trust, /export function isCatalogueMatchedBadge/);
  assert.match(trust, /surface === "card"/);
  assert.match(trust, /isCatalogueMatchedBadge\(license\) \? \[\] : \[license\]/);
  assert.match(src("src/lib/listing-card.ts"), /isCatalogueMatchedBadge\(license\)/);
  const card = src("src/components/daycare-card.tsx");
  assert.match(card, /isCatalogueMatchedBadge\(license\)/);
  assert.match(card, /text-fg dark:text-white/);
  assert.doesNotMatch(card, /space-y-px text-\[#222\]/);
  assert.match(src("src/components/trust-badge.tsx"), /if \(!badges\.length\) return null;/);
});

test("guest listing detail also hides Catalogue-matched", () => {
  const verify = src("src/lib/license-verify.ts");
  assert.match(verify, /isCatalogueMatchedBadge\(badge\)/);
  const trust = src("src/lib/trust.ts");
  assert.match(trust, /surface === "parent"/);
  assert.match(trust, /!isCatalogueMatchedBadge\(license\)/);
  const listing = src("src/routes/daycare.$slug.tsx");
  assert.match(listing, /publicLicenseBadge/);
  assert.doesNotMatch(listing, /trustCatalogueMatched/);
});
