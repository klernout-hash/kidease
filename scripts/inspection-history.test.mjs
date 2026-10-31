import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { isPublicInspectionUrl, parseInspectionCache } from "../src/lib/inspection-history.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

test("inspection history stays off and only keeps a public government row", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_INSPECTION_HISTORY, false);
  assert.equal(isPublicInspectionUrl("https://data.ontario.ca/dataset/child-care"), true);
  assert.equal(isPublicInspectionUrl("https://www2.gov.bc.ca/childcare"), true);
  assert.equal(isPublicInspectionUrl("https://www.alberta.ca/child-care-licensing"), true);
  assert.equal(isPublicInspectionUrl("https://example.com/inspection"), false);
  const kept = parseInspectionCache([
    {
      province: "ON",
      licenceNumber: "CC-100",
      inspectedOn: "2026-04-02",
      outcome: "Follow-up required",
      summary: "Posted on the public licensing page.",
      sourceUrl: "https://www.ontario.ca/page/child-care-rules-ontario",
    },
    {
      province: "ON",
      licenceNumber: "CC-100",
      inspectedOn: "2026-04-02",
      outcome: "Made up",
      summary: "No source",
      sourceUrl: "https://example.com/fake",
    },
    { province: "MB", licenceNumber: "1", inspectedOn: "2026-01-01", outcome: "Ok", sourceUrl: "https://www.ontario.ca/x" },
  ]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].outcome, "Follow-up required");
  assert.match(src(".env.example"), /^FEATURE_INSPECTION_HISTORY=0$/m);
  assert.match(src("src/lib/server/daycares.ts"), /readCachedInspections/);
  assert.match(src("src/components/inspection-trust-card.tsx"), /inspection-history/);
  assert.match(src("migrations/0109_inspection_history.sql"), /listing_inspections/);
  assert.doesNotMatch(src("src/lib/server/inspection-history.ts"), /delete from daycares/i);
});
