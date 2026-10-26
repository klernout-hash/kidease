import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { licenceVerifiedStamp, showLicenceVerifiedBadge } from "../src/lib/license-status.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("Licence verified only when an operator confirmed and the licence is still current", () => {
  assert.equal(
    showLicenceVerifiedBadge({
      licenseStatus: "matched",
      registryMatchState: "matched",
      licenseVerificationSource: "admin",
      licenseVerifiedAt: "2026-10-01T12:00:00.000Z",
    }),
    true,
  );
  assert.equal(
    showLicenceVerifiedBadge({
      licenseStatus: "matched",
      registryMatchState: "matched",
      licenseVerificationSource: "provider",
      licenseVerifiedAt: "2026-10-01T12:00:00.000Z",
    }),
    true,
  );
  assert.equal(
    showLicenceVerifiedBadge({
      licenseStatus: "matched",
      registryMatchState: "matched",
      licenseVerificationSource: "admin",
      licenseVerifiedAt: null,
    }),
    false,
  );
  assert.equal(
    showLicenceVerifiedBadge({
      licenseStatus: "matched",
      registryMatchState: "matched",
      licenseVerificationSource: "local_catalog",
      licenseVerifiedAt: "2026-10-01T12:00:00.000Z",
    }),
    false,
  );
  assert.equal(
    showLicenceVerifiedBadge({
      licenseStatus: "unverified",
      registryMatchState: "mismatch",
      licenseVerificationSource: "admin",
      licenseVerifiedAt: "2026-10-01T12:00:00.000Z",
    }),
    false,
  );
  for (const licenseStatus of ["expired", "suspended"]) {
    assert.equal(
      showLicenceVerifiedBadge({
        licenseStatus,
        registryMatchState: "matched",
        licenseVerificationSource: "admin",
        licenseVerifiedAt: "2026-01-01T00:00:00.000Z",
      }),
      false,
      licenseStatus,
    );
  }
  assert.equal(showLicenceVerifiedBadge({ licenseStatus: "unverified" }), false);
  const verifiedAt = new Date("2026-10-01T12:00:00.000Z");
  assert.equal(
    showLicenceVerifiedBadge({
      licenseStatus: "matched",
      registryMatchState: "matched",
      licenseVerificationSource: "admin",
      licenseVerifiedAt: verifiedAt,
    }),
    true,
  );
  assert.equal(licenceVerifiedStamp(verifiedAt), "2026-10-01T12:00:00.000Z");
  assert.equal(licenceVerifiedStamp(1_759_315_200_000), new Date(1_759_315_200_000).toISOString());
  assert.equal(licenceVerifiedStamp(null), "");
  assert.doesNotThrow(() => licenceVerifiedStamp(verifiedAt));
});

test("public badge uses the helper and keeps Registry-checked for older matches", () => {
  const trust = src("src/lib/trust.ts");
  const copy = src("src/lib/copy.ts");
  assert.match(trust, /if \(showLicenceVerifiedBadge\(item\)\)/);
  assert.match(src("src/lib/server/map-row.ts"), /licenseVerifiedAt: asIsoString\(r\.license_verified_at\)/);
  assert.doesNotMatch(src("src/lib/license-status.ts"), /licenseVerifiedAt\?\.trim/);
  assert.match(trust, /id: "license_verified"/);
  assert.match(trust, /labelKey: "trustLicenceVerified"/);
  assert.match(trust, /id: "license_matched"/);
  assert.match(copy, /trustLicensedMatched: "Registry-checked"/);
  assert.match(copy, /trustLicenceVerified: "Licence verified"/);
  assert.match(copy, /trustLicenceVerified: "Permis vérifié"/);
  assert.match(copy, /official provincial registry/);
  assert.match(copy, /registre provincial officiel/);
  assert.doesNotMatch(copy, /trustLicenceVerified: "License verified"/);
  assert.doesNotMatch(copy, /state registry|United States/i);
});
