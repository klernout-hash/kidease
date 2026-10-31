import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { copy } from "../src/lib/copy.ts";
import { licenceCoveragePercent, licenceVerifiedExtra, showLicenceVerifiedBadge } from "../src/lib/license-status.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

test("the licence badge can say verified on a date", () => {
  assert.equal(licenceVerifiedExtra("Oct 31, 2026", "verified on"), "verified on Oct 31, 2026");
  assert.equal(licenceVerifiedExtra("31 oct. 2026", "vérifié le"), "vérifié le 31 oct. 2026");
  assert.equal(licenceVerifiedExtra("", "verified on"), "");
  assert.equal(copy.en.verifiedOn, "verified on");
  assert.equal(copy.fr.verifiedOn, "vérifié le");
  assert.equal(
    showLicenceVerifiedBadge({
      licenseStatus: "matched",
      licenseVerificationSource: "admin",
      licenseVerifiedAt: "2026-10-31T15:00:00.000Z",
    }),
    true,
  );
  const badge = src("src/components/trust-badge.tsx");
  assert.match(badge, /license_verified/);
  assert.match(badge, /licenceVerifiedExtra/);
  assert.match(badge, /t\("verifiedOn"\)/);
});

test("coverage is a share of public listings and does not drop rows", () => {
  assert.equal(licenceCoveragePercent({ listings: 0, verified: 0 }), null);
  assert.equal(licenceCoveragePercent({ listings: 1000, verified: 25 }), 2.5);
  assert.equal(licenceCoveragePercent({ listings: 10, verified: 10 }), 100);
  const server = src("src/lib/server/trust.ts");
  assert.match(server, /listLicenceCoverage/);
  assert.match(server, /license_verified_at is not null/);
  assert.doesNotMatch(server, /delete from daycares/i);
  assert.match(src("src/components/admin-trust.tsx"), /Licence verified coverage/);
  assert.match(src("src/components/admin-desk-page.tsx"), /listLicenceCoverage/);
});
