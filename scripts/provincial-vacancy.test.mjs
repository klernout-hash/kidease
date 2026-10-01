import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  MB_SOURCE_URL,
  NB_SOURCE_URL,
  matchVacancyRows,
  mergeVacancyImport,
  parseMbLocations,
  parseNbCsv,
  provincialOpeningLine,
  vacancyEventProps,
} from "../src/lib/provincial-vacancy.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");
const now = Date.parse("2026-10-01T16:00:00Z");
const fresh = "2026-09-20T12:00:00.000Z";
const stale = "2026-08-01T12:00:00.000Z";

const listings = [
  { id: "d1", province: "MB", licence: "MB-101548", name: "Advantage Child Care", address: "51 Scurfield Boulevard", city: "Winnipeg", claimed: false, ownVacancy: false },
  { id: "d2", province: "Manitoba", licence: "", name: "Elm Place", address: "10 Elm Street", city: "Brandon", claimed: true, ownVacancy: true },
  { id: "d3", province: "MB", licence: "999", name: "Elm Place", address: "10 Elm Street", city: "Brandon", claimed: false, ownVacancy: false },
  { id: "d4", province: "NB", licence: "27678", name: "GBC Early Learning Centre", address: "12 Main Street", city: "Moncton", claimed: false, ownVacancy: false },
];

test("Manitoba rows match licence first, then one name plus address", () => {
  const parsed = parseMbLocations([
    { facilityIdNum: "101548", name: "Other Name", facilityAddress: { address: "1 Other", city: "Winnipeg" }, age0To2Vacancy: 1, age2To6NurseryVacancy: 0, age2To6PreschoolVacancy: 2, age6To12Vacancy: 0 },
    { facilityIdNum: "000", name: "Elm Place", facilityAddress: { address: "10 Elm Street", city: "Brandon" }, age0To2Vacancy: 0, age2To6NurseryVacancy: 0, age2To6PreschoolVacancy: 3, age6To12Vacancy: 1 },
    { facilityIdNum: "", name: "Unknown House", facilityAddress: { address: "9 Nowhere", city: "Winnipeg" }, age0To2Vacancy: 1, age2To6NurseryVacancy: null, age2To6PreschoolVacancy: null, age6To12Vacancy: null },
  ], fresh);
  assert.equal(parsed.ok, true);
  const matched = matchVacancyRows(parsed.rows, listings);
  assert.equal(matched[0].method, "licence");
  assert.equal(matched[0].daycareId, "d1");
  assert.equal(matched[0].total, 3);
  assert.equal(matched[1].method, "unmatched");
  assert.equal(matched[1].daycareId, null);
  assert.equal(matched[2].method, "unmatched");
  assert.equal(matched[0].sourceUrl, MB_SOURCE_URL);
});

test("a unique name and address matches when the licence is missing", () => {
  const parsed = parseMbLocations([
    { facilityIdNum: "", name: "Advantage Child Care", facilityAddress: { address: "51 Scurfield Boulevard", city: "Winnipeg" }, age0To2Vacancy: 2, age2To6PreschoolVacancy: 0, age2To6NurseryVacancy: 0, age6To12Vacancy: 0 },
  ], fresh);
  const matched = matchVacancyRows(parsed.rows, listings);
  assert.equal(matched[0].method, "name_address");
  assert.equal(matched[0].daycareId, "d1");
});

test("stale provincial numbers stay hidden and a centre's own vacancy wins", () => {
  const shown = provincialOpeningLine({ total: 4, asOf: fresh, fetchedAt: fresh, sourceUrl: MB_SOURCE_URL, ageLabel: "infant, preschool", claimedOwnVacancy: false, now });
  assert.equal(shown?.total, 4);
  const old = provincialOpeningLine({ total: 4, asOf: stale, fetchedAt: fresh, sourceUrl: MB_SOURCE_URL, ageLabel: "infant", claimedOwnVacancy: false, now });
  assert.equal(old, null);
  const claimed = provincialOpeningLine({ total: 4, asOf: fresh, fetchedAt: fresh, sourceUrl: MB_SOURCE_URL, ageLabel: "infant", claimedOwnVacancy: true, now });
  assert.equal(claimed, null);
  const missing = provincialOpeningLine({ total: null, asOf: fresh, fetchedAt: fresh, sourceUrl: MB_SOURCE_URL, ageLabel: "All ages", claimedOwnVacancy: false, now });
  assert.equal(missing, null);
});

test("a failed fetch keeps the last good number and does not write zero", () => {
  const prev = matchVacancyRows(parseMbLocations([
    { facilityIdNum: "101548", name: "Advantage Child Care", facilityAddress: { address: "51 Scurfield Boulevard", city: "Winnipeg" }, age0To2Vacancy: 2, age2To6NurseryVacancy: 0, age2To6PreschoolVacancy: 1, age6To12Vacancy: 0 },
  ], fresh).rows, listings);
  const failed = mergeVacancyImport(prev, [], true);
  assert.equal(failed.event, "vacancy_import_failed");
  assert.equal(failed.rows[0].total, 3);
  const zeroed = matchVacancyRows(parseMbLocations([
    { facilityIdNum: "101548", name: "Advantage Child Care", facilityAddress: { address: "51 Scurfield Boulevard", city: "Winnipeg" }, age0To2Vacancy: 0, age2To6NurseryVacancy: 0, age2To6PreschoolVacancy: 0, age6To12Vacancy: 0 },
  ], fresh).rows, listings);
  const kept = mergeVacancyImport(prev, zeroed, true);
  assert.equal(kept.rows[0].total, 3);
});

test("New Brunswick open data capacity is not an opening count", () => {
  const csv = [
    "License-Number,Facility-Name,Facility-Address-1,Max-Number-of-Children,Max-Number-of-Infants",
    "27678,GBC Early Learning Centre,12 Main Street,40,8",
  ].join("\n");
  const parsed = parseNbCsv(csv, fresh);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.reason, "no_vacancy_field");
  const withOpenings = parseNbCsv("License-Number,Facility-Name,Facility-Address-1,Openings\n27678,GBC Early Learning Centre,12 Main Street,2\n", fresh);
  assert.equal(withOpenings.ok, true);
  assert.equal(withOpenings.rows[0].ageLabel, "All ages");
  assert.equal(withOpenings.rows[0].total, 2);
  assert.equal(withOpenings.rows[0].sourceUrl, NB_SOURCE_URL);
  const matched = matchVacancyRows(withOpenings.rows, listings);
  assert.equal(matched[0].daycareId, "d4");
  assert.equal(matched[0].method, "licence");
});

test("events carry counts only and the job does not create listings or overwrite spots", () => {
  const props = vacancyEventProps({ province: "MB", matched: 2, unmatched: 1, changed: 1, reason: "ok" });
  assert.equal(props.province, "MB");
  assert.equal("name" in props, false);
  assert.doesNotMatch(JSON.stringify(props), /@/);
  const job = src("src/lib/server/provincial-vacancy.ts");
  assert.doesNotMatch(job, /insert into daycares|update daycares set/i);
  assert.match(job, /vacancy_imported/);
  assert.match(job, /vacancy_import_failed/);
  assert.match(job, /dryRun/);
  assert.match(src("src/components/daycare-card.tsx"), /data-ke="provincial-openings"/);
  assert.doesNotMatch(src("src/routes/search.tsx"), /provincialOpening/);
});
