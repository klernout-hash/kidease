import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const CODES = ["BC", "AB", "SK", "MB", "ON", "QC", "NB", "NS", "PE", "NL", "YT", "NT", "NU"];

test("all 13 provinces and territories are first-class", () => {
  const registry = src("src/lib/province-registry.ts");
  const sql = src("migrations/0023_canada_trust.sql");
  for (const code of CODES) {
    assert.match(registry, new RegExp(`code: "${code}"`));
    assert.match(sql, new RegExp(`'${code}'`));
  }
  assert.match(registry, /nameFr:/);
  assert.match(registry, /adapterStatus: "manual"/);
  assert.match(registry, /adapterStatus: "stub"/);
  assert.match(registry, /code: "NU"[\s\S]*subsidyUrl: null/);
});

test("trust badges never claim KidEase police-checks staff or invent scores", () => {
  const labels = [
    src("src/lib/copy.ts"),
    src("src/components/trust-badge.tsx"),
    src("src/components/listing-badges.tsx"),
  ].join("\n");
  for (const phrase of [
    'trustStaffAttested: "Background checked by KidEase"',
    "Staff vetted by KidEase",
    "safety grade",
    "inspection score",
  ]) {
    assert.equal(labels.includes(phrase), false, phrase);
  }
  assert.match(src("src/lib/trust.ts"), /tone: "neutral"/);
  assert.match(src("src/lib/trust.ts"), /id: "license_unverified"/);
  assert.match(src("src/lib/trust.ts"), /id: "license_matched"/);
  assert.match(src("src/lib/trust.ts"), /surface === "card"\) return \[license\]/);
  assert.match(src("src/lib/trust.ts"), /It does NOT police-check every educator/);
  assert.match(src("src/lib/copy.ts"), /trustLicensedMatched: "Licensed \(registry-matched\)"/);
  assert.match(src("src/lib/copy.ts"), /Staff screening: provider-attested/);
  assert.match(src("src/lib/copy.ts"), /Payments: not charged yet/);
});

test("registry adapters stay stubs and do not scrape", () => {
  const adapters = src("src/lib/server/registry-adapters.ts");
  assert.match(adapters, /TODO \(follow-up PRs, not this UI\)/);
  assert.match(adapters, /live scrape/);
  assert.match(adapters, /ok: false/);
  assert.match(adapters, /reason: "stub"/);
  assert.doesNotMatch(adapters, /cheerio|puppeteer|playwright\.chromium/);
});

test("admin declined claims still hide Waiting and Decline", () => {
  const ui = src("src/routes/admin.tsx");
  assert.match(ui, /disabled=\{busy !== null \|\| status === "declined"\}/);
  assert.match(ui, /c\.reviewNote/);
  assert.match(src("src/components/admin-trust.tsx"), /Mark registry-matched/);
});

test("shared badge system is used on parent, provider, and admin", () => {
  const listing = src("src/routes/daycare.\$slug.tsx");
  assert.match(listing, /TrustExplainer/);
  assert.match(listing, /ListingReport/);
  assert.match(listing, /licenseBadge/);
  assert.doesNotMatch(listing, /t\("licenseActive"\)/);
  const provider = src("src/routes/provider.tsx");
  assert.match(provider, /ProviderTrustChecklist/);
  assert.match(provider, /TrustSignals/);
  const admin = src("src/routes/admin.tsx");
  assert.match(admin, /AdminTrustPanel/);
  assert.match(admin, /AdminLicenseActions/);
  const badges = src("src/components/listing-badges.tsx");
  assert.match(badges, /TrustSignals/);
  assert.doesNotMatch(badges, /t\("licensed"\)/);
});

test("migration adds listing trust fields without fake grades", () => {
  const sql = src("migrations/0023_canada_trust.sql");
  for (const col of [
    "license_status",
    "license_expiry",
    "licensed_capacity",
    "registry_match_state",
    "license_verified_at",
    "license_verification_source",
    "staff_screening_attested",
    "staff_screening_attested_at",
    "staff_screening_attested_by",
    "listing_trust_events",
    "listing_reports",
    "ca_jurisdictions",
  ]) {
    assert.match(sql, new RegExp(col));
  }
  assert.doesNotMatch(sql, /inspection_score|safety_grade|background_checked/);
});
