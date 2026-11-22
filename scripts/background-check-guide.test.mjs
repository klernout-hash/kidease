import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BG_PROVINCE_CODES,
  BG_ROLES,
  attestationLine,
  backgroundCheckReminder,
  checksForRole,
  forbiddenPublicPhrase,
  guidePlainText,
  jurisdictionByCode,
  listJurisdictions,
  renewalFor,
} from "../src/lib/background-check-guide.ts";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { FOOTER_DAYCARES } from "../src/lib/site-footer-nav.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (path) => readFileSync(join(root, path), "utf8");

test("every province and territory has a sourced guide", () => {
  assert.equal(listJurisdictions().length, 13);
  assert.deepEqual(listJurisdictions().map((row) => row.code), [...BG_PROVINCE_CODES]);
  for (const code of BG_PROVINCE_CODES) {
    const row = jurisdictionByCode(code);
    assert.ok(row, code);
    assert.ok(row.checks.length > 0, code);
    for (const check of row.checks) {
      assert.ok(check.sources.length > 0, `${code} ${check.id}`);
      for (const source of check.sources) {
        assert.match(source.asOf, /^\d{4}-\d{2}-\d{2}$/, source.label);
      }
      assert.ok(check.whatEn.length > 20, check.id);
      assert.ok(check.whatFr.length > 20, check.id);
    }
  }
});

test("published costs are only the ones in the research note", () => {
  const published = listJurisdictions().flatMap((row) => row.checks.filter((check) => check.costPublished).map((check) => check.id));
  assert.deepEqual(published.sort(), ["bc_crrp", "mb_car", "ns_car"]);
  const bc = jurisdictionByCode("BC").checks[0];
  assert.match(bc.costEn, /\$28/);
  assert.match(bc.costEn, /\$0/);
  assert.match(jurisdictionByCode("MB").checks.find((check) => check.id === "mb_car").costEn, /\$20/);
  assert.match(jurisdictionByCode("MB").checks.find((check) => check.id === "mb_car").costEn, /\$5/);
  assert.match(jurisdictionByCode("NS").checks.find((check) => check.id === "ns_car").costEn, /no fee/i);
  for (const row of listJurisdictions()) {
    for (const check of row.checks) {
      if (check.costPublished) continue;
      assert.doesNotMatch(check.costEn, /\$\d/);
      assert.doesNotMatch(check.costFr, /\d+\s*\$/);
    }
  }
});

test("unconfirmed items stay unmarked as settled law", () => {
  const nu = jurisdictionByCode("NU").checks[0];
  assert.equal(nu.unconfirmed, true);
  assert.equal(nu.renewal.mode, "unconfirmed");
  assert.match(nu.renewalEn, /Do not use a 2-year/);
  assert.equal(renewalFor("NU", "crc").mode, "unconfirmed");
  const yt = jurisdictionByCode("YT").checks[0];
  assert.equal(yt.unconfirmed, true);
  assert.equal(yt.renewal.mode, "centre_policy");
  assert.match(yt.whatEn, /unconfirmed/);
  assert.equal(jurisdictionByCode("SK").checks[0].renewal.mode, "centre_policy");
  assert.equal(jurisdictionByCode("MB").checks[0].renewal.mode, "centre_policy");
  const nl = jurisdictionByCode("NL");
  assert.match(nl.checks.find((check) => check.kind === "crc_vsc").whatEn, /18 or older/);
  assert.match(nl.checks.find((check) => check.kind === "suitability_consent").whatEn, /16 or older/);
  assert.match(nl.summaryEn, /broader than the regulation|Follow the regulation|split/i);
});

test("reminders follow the cited interval or the centre policy", () => {
  const today = "2026-11-22";
  const ab = backgroundCheckReminder({
    province: "AB",
    kind: "crc_vsc",
    issuedOn: "2023-11-01",
    expiresOn: null,
    policyMonths: null,
    today,
  });
  assert.equal(ab.basis, "statute");
  assert.equal(ab.dueOn, "2026-11-01");
  assert.equal(ab.status, "expired");
  const on = backgroundCheckReminder({
    province: "ON",
    kind: "vsc",
    issuedOn: "2023-06-01",
    expiresOn: null,
    policyMonths: null,
    today,
  });
  assert.equal(on.dueOn, "2028-06-01");
  assert.equal(on.status, "current");
  const declaration = backgroundCheckReminder({
    province: "ON",
    kind: "offence_declaration",
    issuedOn: "2025-11-01",
    expiresOn: null,
    policyMonths: null,
    today,
  });
  assert.equal(declaration.basis, "declaration");
  assert.equal(declaration.dueOn, "2026-11-16");
  assert.equal(declaration.status, "expired");
  const sk = backgroundCheckReminder({
    province: "SK",
    kind: "crc_vsc",
    issuedOn: "2024-01-01",
    expiresOn: null,
    policyMonths: null,
    today,
  });
  assert.equal(sk.status, "needs_policy");
  const skPolicy = backgroundCheckReminder({
    province: "SK",
    kind: "crc_vsc",
    issuedOn: "2024-01-01",
    expiresOn: null,
    policyMonths: 24,
    today,
  });
  assert.equal(skPolicy.basis, "centre_policy");
  assert.equal(skPolicy.dueOn, "2026-01-01");
  assert.equal(skPolicy.status, "expired");
  const nu = backgroundCheckReminder({
    province: "NU",
    kind: "crc",
    issuedOn: "2024-01-01",
    expiresOn: null,
    policyMonths: null,
    today,
  });
  assert.equal(nu.status, "unconfirmed");
  assert.equal(nu.dueOn, null);
  const typed = backgroundCheckReminder({
    province: "NU",
    kind: "crc",
    issuedOn: "2024-01-01",
    expiresOn: "2026-12-01",
    policyMonths: null,
    today,
  });
  assert.equal(typed.basis, "typed_date");
  assert.equal(typed.status, "due_soon");
  const nsCar = renewalFor("NS", "child_abuse_registry");
  const nsVsc = renewalFor("NS", "vsc");
  assert.equal(nsCar.years, 3);
  assert.equal(nsVsc.years, 5);
  assert.equal(renewalFor("NT", "crc_vsc").years, 2);
  assert.equal(renewalFor("BC", "crrp").years, 5);
  assert.equal(renewalFor("QC", "vae").years, 3);
});

test("public words do not claim KidEase checked or verified anyone", () => {
  const text = guidePlainText();
  assert.equal(forbiddenPublicPhrase(text), null);
  const en = attestationLine({ provinceName: "Manitoba", asOf: "22 November 2026", locale: "en" });
  const fr = attestationLine({ provinceName: "Manitoba", asOf: "22 novembre 2026", locale: "fr" });
  assert.equal(
    en,
    "This centre confirms required staff background checks are on file under Manitoba rules - provided by the centre, as of 22 November 2026. KidEase does not verify checks.",
  );
  assert.match(fr, /KidEase ne vérifie pas/);
  assert.equal(forbiddenPublicPhrase(en), null);
  assert.equal(forbiddenPublicPhrase(fr), null);
  assert.doesNotMatch(src("src/components/background-check-attestation.tsx"), /screening_on_file|trustScreeningOnFile/);
  assert.doesNotMatch(src("src/lib/server/background-check-records.ts"), /screening_on_file/);
});

test("flags stay off and the footer link is gated", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_BG_CHECK_GUIDE, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_BG_CHECK_RECORDS, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_BG_CHECK_ATTESTATION, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_SCREENING_STATUS, false);
  assert.equal(FOOTER_DAYCARES.some((link) => link.to === "/background-checks"), false);
  assert.match(src("src/components/site-footer.tsx"), /withBackgroundCheckLink/);
  assert.match(src("src/lib/site-footer-nav.ts"), /bgGuide === true/);
  assert.match(src(".env.example"), /^FEATURE_BG_CHECK_GUIDE=0$/m);
  assert.match(src(".env.example"), /^FEATURE_BG_CHECK_RECORDS=0$/m);
  assert.match(src(".env.example"), /^FEATURE_BG_CHECK_ATTESTATION=0$/m);
  assert.doesNotMatch(src(".env.example"), /^FEATURE_BG_CHECK_GUIDE=1$/m);
});

test("each role is represented or explicitly noted", () => {
  for (const row of listJurisdictions()) {
    for (const role of BG_ROLES) {
      const checks = checksForRole(row, role);
      const note = row.roleNotes[role];
      assert.ok(checks.length > 0 || note, `${row.code} ${role}`);
    }
  }
});
