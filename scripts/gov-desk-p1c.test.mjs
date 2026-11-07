import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { govCopy } from "../src/lib/gov/copy.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the overview says when the counts were taken", () => {
  assert.match(govCopy("en").asOf, /Counts as of/);
  assert.match(govCopy("fr").asOf, /Totaux en date du/);
  assert.deepEqual(Object.keys(govCopy("en")).sort(), Object.keys(govCopy("fr")).sort());
  assert.match(read("../src/components/gov/gov-dashboard.tsx"), /data-ke="gov-as-of"/);
});

test("government complaints and fee flags stay as counts", () => {
  const complaints = read("../src/lib/server/compliance-complaints.ts");
  const govComplaints = complaints.slice(complaints.indexOf("export const loadGovComplaints"), complaints.indexOf("export const loadAdminComplaints"));
  assert.doesNotMatch(govComplaints, /tracking_code/);
  assert.match(read("../src/components/compliance/complaints-page.tsx"), /data-ke="gov-complaint-aggregate"/);
  assert.doesNotMatch(read("../src/routes/gov_.complaints.tsx"), /showCases/);
  assert.match(read("../src/routes/admin-gov-complaints.tsx"), /showCases/);

  const fees = read("../src/lib/server/compliance-fees.ts");
  const govFees = fees.slice(fees.indexOf("export const loadGovFees"), fees.indexOf("export const loadAdminFees"));
  const countFn = fees.slice(fees.indexOf("async function govFlagCounts"), fees.indexOf("async function govFlags"));
  assert.match(govFees, /govFlagCounts/);
  assert.doesNotMatch(govFees, /govFlags\(/);
  assert.doesNotMatch(countFn, /d\.name/);
  assert.match(read("../src/components/compliance/fees-page.tsx"), /data-ke="gov-fee-aggregate"/);
  assert.doesNotMatch(read("../src/routes/gov_.fee-caps.tsx"), /showCentres/);
  assert.match(read("../src/routes/admin-gov-fee-caps.tsx"), /showCentres/);
});
