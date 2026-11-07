import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { feeCopy } from "../src/lib/compliance/fees.ts";
import { incidentCopy } from "../src/lib/compliance/incidents.ts";
import { complaintCopy } from "../src/lib/compliance/complaints.ts";
import { govCopy } from "../src/lib/gov/copy.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("government section pages say what they can prove", () => {
  assert.match(feeCopy("en").govWhy, /not assessed/);
  assert.doesNotMatch(feeCopy("en").govWhy, /above the cap/);
  assert.match(incidentCopy("en").govWhy, /not an official provincial file/);
  assert.match(complaintCopy("en").govWhy, /not an official finding/);
  assert.match(incidentCopy("fr").govWhy, /pas un dossier provincial officiel/);
  assert.match(govCopy("en").exportsLimit, /not an official regulatory export/);
  assert.match(govCopy("fr").exportsLimit, /pas une exportation réglementaire officielle/);
  assert.deepEqual(Object.keys(govCopy("en")).sort(), Object.keys(govCopy("fr")).sort());
});

test("the government incidents desk does not load or show a child name", () => {
  const server = read("../src/lib/server/compliance-incidents.ts");
  const counts = server.slice(server.indexOf("async function govCounts"), server.indexOf("async function govRows"));
  const govLoad = server.slice(server.indexOf("export const loadGovIncidents"), server.indexOf("export const loadAdminIncidents"));
  assert.doesNotMatch(counts, /child_label|summary/);
  assert.match(govLoad, /govCounts\(/);
  assert.doesNotMatch(govLoad, /govRows\(/);
  const page = read("../src/components/compliance/incidents-page.tsx");
  assert.doesNotMatch(page, /row\.child_label/);
  assert.match(page, /data-ke="gov-incident-aggregate"/);
  assert.match(read("../src/components/compliance/frame.tsx"), /GovSectionStrip/);
  assert.match(read("../src/components/gov/gov-exports.tsx"), /data-ke="gov-export-limit"/);
  assert.doesNotMatch(read("../src/components/compliance/fees-page.tsx"), /Fees above the cap/);
});
