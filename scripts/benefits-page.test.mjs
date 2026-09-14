import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  AB_EXTENDED_HOURS,
  AB_K_FACILITY_MAX_UNDER_50K,
  AB_K_FACILITY_NEAR_90K,
  AB_SUBSIDY_HREF,
  CCB,
  CDB,
  MB_SUBSIDY_HREF,
  MB_ZERO_FEE_EFFECTIVE_EN,
  ON_SUBSIDY_HREF,
  moneyEn,
} from "../src/lib/benefits-facts.ts";
import { BENEFIT_PROGRAMS, BENEFITS_BRIEF } from "../src/lib/benefits-knowledge.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("CCB and CDB 2026–27 amounts match CRA-published figures", () => {
  assert.equal(CCB.maxUnder6Year, 8157);
  assert.equal(CCB.maxUnder6Month, 679.75);
  assert.equal(CCB.max6to17Year, 6883);
  assert.equal(CCB.max6to17Month, 573.58);
  assert.equal(CCB.fullAfni, 38237);
  assert.equal(CCB.afniYear, 2025);
  assert.equal(CDB.maxYear, 3480);
  assert.equal(CDB.maxMonth, 290);
  assert.match(CCB.howMuchEn, /canada-child-benefit\/how-much/);
  assert.match(CDB.hrefEn, /child-disability-benefit/);
});

test("benefits page has Federal, CWELCC, and provincial sections; no KidEase calculator", () => {
  const page = src("src/routes/benefits.tsx");
  assert.match(page, /id="federal"/);
  assert.match(page, /id="cwelcc"/);
  assert.match(page, /id="provincial"/);
  assert.match(page, /benefitsSectionFederal/);
  assert.match(page, /CCB\.howMuchEn/);
  assert.match(page, /MB_ZERO_FEE_EFFECTIVE/);
  assert.doesNotMatch(page, /key: "fed"/);
  assert.doesNotMatch(page, /eligibility calculator|KidEase calculator/i);
  assert.match(page, /Not every licensed centre is in CWELCC/);
});

test("EN and FR copy cover 2026–27 stacking rules without inventing a BC table", () => {
  const copySrc = src("src/lib/copy.ts");
  assert.match(copySrc, /benefitsReviewed:\s*\n\s*"Last reviewed September 2026/);
  assert.match(copySrc, /Dernière revue : septembre 2026/);
  assert.match(copySrc, /Effective September 13, 2026/);
  assert.match(copySrc, /13 septembre 2026/);
  assert.match(copySrc, /\$0 parent fees/);
  assert.match(copySrc, /\$644\/month/);
  assert.match(copySrc, /\$161/);
  assert.match(copySrc, /about 50%/);
  assert.match(copySrc, /does not publish a dollar table/);
  assert.match(copySrc, /reduced-contribution/);
  assert.match(copySrc, /benefitsSk:[\s\S]*Amounts vary/);
  assert.match(copySrc, /benefitsSectionFederal: "Federal benefits"/);
  assert.match(copySrc, /benefitsSectionFederal: "Prestations fédérales"/);
});

test("chat knowledge stays aligned with official amounts and Manitoba zero-fee date", () => {
  const fed = BENEFIT_PROGRAMS.find((p) => p.key === "fed");
  const mb = BENEFIT_PROGRAMS.find((p) => p.key === "mb");
  assert.ok(fed?.reply.includes(moneyEn(CCB.maxUnder6Year)));
  assert.ok(fed?.reply.includes(CCB.howMuchEn));
  assert.ok(fed?.reply.includes(moneyEn(CDB.maxYear)));
  assert.ok(mb?.reply.includes(MB_ZERO_FEE_EFFECTIVE_EN));
  assert.ok(mb?.href === MB_SUBSIDY_HREF);
  assert.match(BENEFITS_BRIEF, /50% reduction/);
  assert.match(BENEFITS_BRIEF, new RegExp(String(AB_K_FACILITY_MAX_UNDER_50K)));
  assert.match(BENEFITS_BRIEF, new RegExp(String(AB_K_FACILITY_NEAR_90K)));
  assert.match(BENEFITS_BRIEF, new RegExp(String(AB_EXTENDED_HOURS)));
  const on = BENEFIT_PROGRAMS.find((p) => p.key === "on");
  assert.ok(on?.href === ON_SUBSIDY_HREF);
  const ab = BENEFIT_PROGRAMS.find((p) => p.key === "ab");
  assert.ok(ab?.href === AB_SUBSIDY_HREF);
});
