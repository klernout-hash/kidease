import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { provincialVacancyIndexEnabled } from "../src/lib/features.ts";
import {
  countFreshness,
  freshnessBand,
  freshnessByProvince,
  officialOpeningTotal,
  parseVacancyProvince,
  sameVacancySnapshot,
  shouldRecordVacancy,
  VACANCY_AGING_DAYS,
  VACANCY_FRESH_DAYS,
} from "../src/lib/vacancy-history.ts";
import { vacancyProvinceCopy } from "../src/lib/vacancy-province-copy.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");
const NOW = Date.parse("2026-10-31T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

test("the provincial vacancy index flag defaults off", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_PROVINCIAL_VACANCY_INDEX, false);
  assert.equal(provincialVacancyIndexEnabled({}), false);
  assert.equal(provincialVacancyIndexEnabled({ FEATURE_PROVINCIAL_VACANCY_INDEX: "1" }), true);
  assert.match(read(".env.example"), /^FEATURE_PROVINCIAL_VACANCY_INDEX=0$/m);
  assert.match(read("docs/flags.md"), /FEATURE_PROVINCIAL_VACANCY_INDEX/);
  assert.doesNotMatch(read(".env.example"), /^FEATURE_PROVINCIAL_VACANCY_INDEX=1$/m);
});

test("freshness bands use the stored confirm time", () => {
  assert.equal(VACANCY_FRESH_DAYS, 14);
  assert.equal(VACANCY_AGING_DAYS, 30);
  assert.equal(freshnessBand(null, NOW), "unknown");
  assert.equal(freshnessBand(new Date(NOW - 2 * DAY).toISOString(), NOW), "fresh");
  assert.equal(freshnessBand(new Date(NOW - 20 * DAY).toISOString(), NOW), "aging");
  assert.equal(freshnessBand(new Date(NOW - 40 * DAY).toISOString(), NOW), "stale");
  const counts = countFreshness([new Date(NOW - DAY).toISOString(), null, "not-a-date"], NOW);
  assert.equal(counts.fresh, 1);
  assert.equal(counts.unknown, 2);
  const byProvince = freshnessByProvince(
    [
      { province: "Manitoba", lastVacancyUpdatedAt: new Date(NOW - DAY).toISOString() },
      { province: "nope", lastVacancyUpdatedAt: new Date(NOW).toISOString() },
    ],
    NOW,
  );
  assert.equal(byProvince.MB.fresh, 1);
  assert.equal(byProvince.nope, undefined);
});

test("history records a confirm and a real count change only", () => {
  assert.equal(parseVacancyProvince("mb"), "MB");
  assert.equal(parseVacancyProvince("France"), "");
  assert.equal(sameVacancySnapshot({ infant: 1, toddler: null, preschool: 0 }, { infant: 1, toddler: null, preschool: 0 }), true);
  assert.equal(
    shouldRecordVacancy({
      source: "edit",
      before: { infant: 1, toddler: 0, preschool: 0 },
      after: { infant: 1, toddler: 0, preschool: 0 },
    }),
    false,
  );
  assert.equal(
    shouldRecordVacancy({
      source: "edit",
      before: { infant: 1, toddler: 0, preschool: 0 },
      after: { infant: 0, toddler: 0, preschool: 0 },
    }),
    true,
  );
  assert.equal(
    shouldRecordVacancy({
      source: "confirm",
      before: { infant: 1, toddler: 0, preschool: 0 },
      after: { infant: 1, toddler: 0, preschool: 0 },
    }),
    true,
  );
});

test("a province file total needs a date and a count", () => {
  assert.equal(officialOpeningTotal({ centres: 0, openings: 4, fetchedAt: "2026-10-01T00:00:00.000Z" }), null);
  assert.equal(officialOpeningTotal({ centres: 2, openings: null, fetchedAt: "2026-10-01T00:00:00.000Z" }), null);
  assert.equal(officialOpeningTotal({ centres: 2, openings: 5, fetchedAt: "" }), null);
  assert.deepEqual(officialOpeningTotal({ centres: 2, openings: 5, fetchedAt: "2026-10-01T00:00:00.000Z" }), {
    centres: 2,
    openings: 5,
    fetchedAt: "2026-10-01T00:00:00.000Z",
  });
});

test("province pages stay behind the flag and keep the national index", () => {
  const page = read("src/routes/vacancy-index.tsx");
  const fr = read("src/routes/fr.vacancy-index.tsx");
  const server = read("src/lib/server/vacancy-index.ts");
  const history = read("src/lib/server/vacancy-history.ts");
  const claims = read("src/lib/server/claims.ts");
  assert.match(page, /parseVacancyProvince/);
  assert.match(page, /localePath\("\/help", locale\)/);
  assert.match(page, /data-ke="vacancy-history"/);
  assert.match(page, /vacancyIndexTitle/);
  assert.doesNotMatch(page, /\/plans/);
  assert.doesNotMatch(page, /google/i);
  assert.match(fr, /loadVacancyIndex\(deps\.province\)/);
  assert.match(server, /provincialVacancyIndexEnabled/);
  assert.match(server, /loadProvinceHistory/);
  assert.match(history, /FEATURE_PROVINCIAL_VACANCY_INDEX|provincialVacancyIndexEnabled/);
  assert.match(history, /spots_updated_at = now\(\)/);
  assert.match(claims, /recordVacancyEvent/);
  assert.match(read("src/lib/server/family.ts"), /recordVacancyEvent/);
  assert.match(read("migrations/0112_vacancy_history.sql"), /create table if not exists vacancy_events/);
  const en = vacancyProvinceCopy("en");
  const french = vacancyProvinceCopy("fr");
  assert.match(en.lead, /does not promise a space/);
  assert.match(french.help, /Aide/);
  assert.doesNotMatch(en.lead, /free forever/i);
});
