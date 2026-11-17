import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { filteredTableCsv, filteredTablePdfLines } from "../src/lib/gov/filtered-export.ts";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";

test("a filtered table exports only the rows it was given", () => {
  const csv = filteredTableCsv(["City", "Spots"], [["Winnipeg", 4], ["Brandon", null]]);
  assert.match(csv, /Winnipeg,4/);
  assert.match(csv, /Brandon,/);
  assert.doesNotMatch(csv, /Toronto/);
  const lines = filteredTablePdfLines("Cities", ["City", "Spots"], [["Winnipeg", 4]]);
  assert.equal(lines[0], "Cities");
  assert.match(lines[2], /Winnipeg/);
});

test("the government tables can download the filtered view", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_GOV_FILTERED_EXPORT, true);
  const page = readFileSync(new URL("../src/components/gov/gov-dashboard.tsx", import.meta.url), "utf8");
  const button = readFileSync(new URL("../src/components/gov/filtered-table-export.tsx", import.meta.url), "utf8");
  assert.match(page, /FilteredTableExport/);
  assert.match(button, /gov-filtered-export/);
});
