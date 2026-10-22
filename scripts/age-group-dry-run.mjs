/**
 * Read-only age-group coverage report.
 * Reads the sourced CSV and prints counts. It does not open a database.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  provinceAgeMappingTable,
  provinceCodeFromFacilityId,
  summarizeAgeGroupCoverage,
} from "../src/lib/standard-age-groups.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const csv = readFileSync(join(root, "data/ops/ages-sourced-20261002.csv"), "utf8");
const table = parseCsv(csv);
const header = table[0] ?? [];
const at = Object.fromEntries(header.map((name, index) => [name, index]));
const listings = table.slice(1).filter((cols) => cols[at.listing_id]).map((cols) => {
  const facilityId = cols[at.facility_id] ?? "";
  return {
    listingId: cols[at.listing_id] ?? "",
    facilityId,
    province: provinceCodeFromFacilityId(facilityId),
    ageMinMonths: Number(cols[at.age_min_months]),
    ageMaxMonths: Number(cols[at.age_max_months]),
    ageGroups: cols[at.age_groups] ?? "",
    agesKnown: true,
  };
});

const report = {
  mapping: provinceAgeMappingTable(),
  coverage: summarizeAgeGroupCoverage(listings),
};
console.log(JSON.stringify(report, null, 2));
