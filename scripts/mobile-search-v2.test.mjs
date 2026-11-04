import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { mobileSearchV2Enabled } from "../src/lib/features.ts";
import { geocode } from "../src/lib/geo.ts";
import { indexedPlaceQuery, originFromSearchQuery } from "../src/lib/search-query.ts";
import {
  applyDateFlex,
  changeCount,
  draftFromParams,
  emptyMobileSearch,
  localWhereSuggestions,
  mobileSearchParams,
  nextStep,
  rememberMobileSearch,
  resultsHeadline,
  resultsSubline,
  schoolYearWindow,
  setStep,
  whenAnswer,
  whereAnswer,
  whoAnswer,
} from "../src/lib/mobile-search-v2.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function draft(patch) {
  return { ...emptyMobileSearch(), ...patch, counts: { ...emptyMobileSearch().counts, ...(patch.counts || {}) } };
}

test("FEATURE_MOBILE_SEARCH_V2 stays off and the old search stays in the tree", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_MOBILE_SEARCH_V2, false);
  assert.equal(mobileSearchV2Enabled({}), false);
  assert.equal(mobileSearchV2Enabled({ FEATURE_MOBILE_SEARCH_V2: "1" }), true);
  assert.match(src(".env.example"), /^FEATURE_MOBILE_SEARCH_V2=0$/m);
  const home = src("src/routes/index.tsx");
  const search = src("src/routes/search.tsx");
  const sheet = src("src/components/mobile-search-sheet.tsx");
  assert.match(home, /boot\.mobileSearchV2 \?/);
  assert.match(home, /ExploreSearchBar/);
  assert.match(home, /readMobileSearchV2/);
  assert.match(search, /boot\.mobileSearchV2 \?/);
  assert.match(search, /ExploreSearchBar/);
  assert.match(search, /withPaintBudget\(/);
  assert.match(search, /indexedPlaceQuery/);
  assert.match(search, /SQL_SETTLE_MS/);
  assert.match(search, /readMobileSearchV2/);
  assert.doesNotMatch(sheet, /google-places|suggestPlaces/);
  assert.match(sheet, /localWhereSuggestions/);
  assert.match(sheet, /data-ke="msv2-pill"/);
  assert.match(sheet, /data-ke="msv2-sheet"/);
});

test("Where, When, and Who open one step at a time", () => {
  const start = emptyMobileSearch();
  assert.equal(start.step, "where");
  assert.equal(nextStep("where"), "when");
  assert.equal(nextStep("when"), "who");
  assert.equal(nextStep("who"), "search");
  assert.equal(setStep(start, "when").step, "when");
  assert.equal(whereAnswer(start), "");
  assert.equal(whenAnswer(start), "");
  assert.equal(whoAnswer(start), "");
});

test("closed cards and the results summary use the answer, in English and French", () => {
  const filled = draft({
    where: "Winnipeg, R3T",
    from: "2026-01-06",
    schedule: "full-time",
    counts: { toddler: 1 },
  });
  assert.equal(whereAnswer(filled), "Winnipeg, R3T");
  assert.match(whenAnswer(filled, "en"), /Starts Jan/);
  assert.match(whenAnswer(filled, "en"), /Full-time/);
  assert.equal(whoAnswer(filled, "en"), "1 child, 2 yrs");
  assert.match(whenAnswer(filled, "fr"), /Dès le/);
  assert.match(whenAnswer(filled, "fr"), /Temps plein/);
  assert.equal(whoAnswer(filled, "fr"), "1 enfant, 2 ans");
  assert.equal(resultsHeadline("Winnipeg", "en"), "Child care in Winnipeg");
  assert.equal(resultsHeadline("Winnipeg", "fr"), "Garderies à Winnipeg");
  const sub = resultsSubline(filled, "en");
  assert.match(sub, /Starts Jan/);
  assert.match(sub, /Full-time/);
  assert.match(sub, /1 child, 2 yrs/);
  assert.match(resultsSubline(filled, "fr"), /1 enfant, 2 ans/);
  assert.equal(whoAnswer(draft({ counts: { infant: 1, toddler: 1 } }), "en"), "2 children");
  assert.equal(whoAnswer(draft({ counts: { preschool: 2 } }), "fr"), "2 enfants");
});

test("Winnipeg and a postal code stay on the existing search index", () => {
  const winnipeg = mobileSearchParams(draft({ where: "Winnipeg", from: "2026-01-06", schedule: "full-time", counts: { toddler: 1 } }));
  assert.equal(winnipeg.q, "Winnipeg");
  assert.equal(winnipeg.from, "2026-01-06");
  assert.equal(winnipeg.sched, "full");
  assert.equal(winnipeg.age, "toddler");
  assert.equal(winnipeg.ages, "toddler");
  assert.equal(indexedPlaceQuery(winnipeg.q), true);
  assert.equal(originFromSearchQuery("Winnipeg")?.label, originFromSearchQuery(winnipeg.q)?.label);

  const postal = mobileSearchParams(draft({ where: "R3T", category: "home" }));
  assert.equal(postal.q, "R3T");
  assert.equal(postal.fac, "family_home");
  assert.equal(indexedPlaceQuery("R3T"), true);
  assert.equal(geocode("R3T")?.label, "Winnipeg, MB");
  assert.equal(originFromSearchQuery("R3T")?.label, "Winnipeg, MB");

  const centre = mobileSearchParams(draft({ where: "Toronto", category: "centre", schedule: "part-time" }));
  assert.equal(centre.fac, "child_care_centre");
  assert.equal(centre.sched, "part");
  const drop = mobileSearchParams(draft({ where: "Calgary", schedule: "drop-in", category: "open", subsidy: true, french: true }));
  assert.equal(drop.sched, "flexible");
  assert.equal(drop.openings, "1");
  assert.equal(drop.subsidy, "1");
  assert.equal(drop.spoken, "fr");
  const school = mobileSearchParams(draft({ where: "Vancouver", schedule: "before-after", accessibility: true }));
  assert.equal(school.cat, "before-after");
  assert.equal(school.inclusive, "1");
  assert.equal(school.sched, undefined);

  const round = draftFromParams(winnipeg);
  assert.equal(round.where, "Winnipeg");
  assert.equal(round.schedule, "full-time");
  assert.equal(round.counts.toddler, 1);
  const suggestions = localWhereSuggestions("Winnipeg");
  assert.ok(suggestions.some((row) => /Winnipeg/i.test(row.label)));
  assert.ok(localWhereSuggestions("R3T").length > 0);
});

test("recent searches keep the last five and do not use the old key", () => {
  let saved = [];
  for (let i = 0; i < 6; i += 1) {
    saved = rememberMobileSearch(saved, draft({ where: `City ${i}`, from: "2026-01-06", counts: { preschool: 1 } }), `2026-01-0${i + 1}`);
  }
  assert.equal(saved.length, 5);
  assert.equal(saved[0].where, "City 5");
  assert.equal(saved.at(-1).where, "City 1");
  saved = rememberMobileSearch(saved, draft({ where: "city 5" }));
  assert.equal(saved.length, 5);
  assert.equal(saved[0].where, "city 5");
  assert.equal(rememberMobileSearch(saved, draft({ where: " " })).length, 5);
  const helper = src("src/lib/mobile-search-v2.ts");
  assert.match(helper, /kidease-mobile-search-v2/);
  assert.doesNotMatch(helper, /kidease-recent-searches/);
});

test("dates stay in the future and the school year has a window", () => {
  const now = new Date(2026, 0, 6);
  const exact = applyDateFlex(draft({ where: "Winnipeg" }), "exact", now);
  assert.equal(exact.dateFlex, "exact");
  const weeks = applyDateFlex(draft({}), "two-weeks", now);
  assert.equal(weeks.from, "2026-01-06");
  assert.equal(weeks.to, "2026-01-20");
  const year = schoolYearWindow(now);
  assert.equal(year.from, "2026-01-06");
  assert.equal(year.to, "2026-06-30");
  const summer = schoolYearWindow(new Date(2026, 6, 15));
  assert.equal(summer.from, "2026-09-01");
  assert.equal(summer.to, "2027-06-30");
  const counted = changeCount(draft({}), "toddler", 1);
  assert.equal(counted.counts.toddler, 1);
  assert.equal(changeCount(counted, "toddler", -1).counts.toddler, 0);
  assert.equal(changeCount(draft({}), "toddler", -1).counts.toddler, 0);
  assert.equal(changeCount(draft({ counts: { toddler: 6 } }), "toddler", 4).counts.toddler, 6);
});

test("English and French copy both name every mobile search string", () => {
  const en = src("src/lib/copy-en.ts");
  const fr = src("src/lib/copy-fr.ts");
  for (const key of [
    "msv2FindNear",
    "msv2AddLocation",
    "msv2AddDate",
    "msv2AddChild",
    "msv2WherePh",
    "msv2SchoolYear",
    "msv2Clear",
    "msv2FrenchProgram",
    "msv2TopRated",
  ]) {
    assert.match(en, new RegExp(`${key}:`));
    assert.match(fr, new RegExp(`${key}:`));
  }
  assert.match(en, /Find child care near you/);
  assert.match(fr, /Trouvez une garderie près de chez vous/);
});
