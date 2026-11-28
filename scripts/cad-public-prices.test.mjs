import assert from "node:assert/strict";
import { test } from "node:test";
import { moneyEn, moneyFr } from "../src/lib/benefits-facts.ts";
import { ageVacancyCopy } from "../src/lib/age-vacancy-copy.ts";
import { listingSubsidy, subsidyLabel } from "../src/lib/fee-program.ts";

test("benefits and city prices explicitly identify CAD in both languages", () => {
  assert.equal(moneyEn(1180), "CA$1,180");
  assert.equal(moneyFr(1180), "1\u00a0180\u00a0$\u00a0CA");
  assert.match(ageVacancyCopy("en").fee(1180), /CA\$1,180/);
  assert.match(ageVacancyCopy("fr").fee(1180), /\$\u00a0CA/);
});

test("listing subsidy labels identify CAD without adding unsupported fees", () => {
  const listed = listingSubsidy({ province: "MB", feeProgram: "mb-10-day" });
  assert.match(subsidyLabel(listed, "en"), /CA\$10/);
  assert.match(subsidyLabel(listed, "fr"), /10\u00a0\$\u00a0CA/);
  assert.equal(listingSubsidy({ province: "MB" }), null);
});
