import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { govCopy } from "../src/lib/gov/copy.ts";

const dash = readFileSync(new URL("../src/components/gov/gov-dashboard.tsx", import.meta.url), "utf8");

test("the government overview keeps six labelled decision cards", () => {
  for (const id of ["gov-card-providers", "gov-card-capacity", "gov-card-vacancies", "gov-card-renewals", "gov-card-findings", "gov-card-jobs"]) {
    assert.match(dash, new RegExp(id));
  }
  assert.match(dash, /data-ke="gov-needs-attention"/);
  assert.match(dash, /data-ke="gov-survey"/);
  assert.match(dash, /"F"/);
  assert.doesNotMatch(dash, /PE", "103", "0"/);
  const en = govCopy("en");
  const fr = govCopy("fr");
  assert.match(en.cardObservedNote, /not an official licence check/);
  assert.match(en.needLicence, /does not mean every licence is current/);
  assert.match(en.waitlist, /Saved-search/);
  assert.match(fr.noReporting, /Aucune donnée déclarée/);
  assert.equal(en.surveyF.includes("not zero"), true);
});

test("an empty fee-cap desk does not claim every centre is under the cap", () => {
  const fees = readFileSync(new URL("../src/components/compliance/fees-page.tsx", import.meta.url), "utf8");
  assert.match(fees, /Unable to assess/);
  assert.doesNotMatch(fees, /No centre is above the published cap/);
});
