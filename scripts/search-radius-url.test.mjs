import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { register } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

await register(new URL("./alias-loader.mjs", import.meta.url), import.meta.url);
const dependencies = Object.assign({}, ...await Promise.all([
  "explore-search", "parent-listing", "search-page", "explore-categories", "pioneer-filters",
  "care-type", "inclusive-search", "phase1-search", "search-start", "ranking/variant",
].map((name) => import(`../src/lib/${name}.ts`))));
const radiusPath = new URL("../src/lib/search-radius.ts", import.meta.url);
const radius = existsSync(radiusPath) ? await import(radiusPath.href) : {};

/** Execute the actual route declaration with pure parsers, without importing its server boundaries. */
function routeFunction(name, extra = {}, file = "search") {
  const path = new URL(`../src/routes/${file}.tsx`, import.meta.url);
  const parsed = ts.createSourceFile(path.pathname, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) declaration = node;
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  assert.ok(declaration, name);
  const source = declaration.getText(parsed)
    .replace('await import("@/lib/features")', '({ reviewReportsEnabled: () => false })')
    .replace('await import("@/lib/mobile-search-flag")', '({ readMobileSearchV2: async () => false })');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = vm.createContext({ exports: {}, URLSearchParams, ...dependencies, ...radius, ...extra });
  new vm.Script(compiled, { filename: path.pathname }).runInContext(context);
  return context.exports[name] ?? context[name];
}

test("search validation retains the chosen radius instead of silently restoring 25 km", () => {
  const validate = routeFunction("searchValidateSearch");
  assert.equal(validate({ q: "Winnipeg", km: "5" }).km, 5);
  assert.equal(validate({ q: "Toronto", radius: "10" }).km, 10);
  assert.equal(validate({ q: "Montréal" }).km, undefined);
});

test("radius accepts canonical and older links, clamps safely, and preserves the bare default", () => {
  for (const [input, expected] of [
    [{ km: "5", radius: 50 }, 5], [{ radius: "10" }, 10], [{ radiusKm: 15 }, 15],
    ["?q=Winnipeg&km=5", 5], [new URLSearchParams("km=10"), 10],
    [{ km: "bad", radius: "5" }, 5], [{ km: "" }, 25], [{ km: null }, 25],
    [{ km: true }, 25], [{ km: "Infinity" }, 25], [{ km: 4.6 }, 5],
    [{ km: 100 }, 50], [{ km: -1 }, 1], [{}, 25],
  ]) assert.equal(radius.searchRadiusFromParams(input), expected, JSON.stringify(input));
  assert.deepEqual(radius.compactSearchRadius({}), {});
  assert.deepEqual(radius.compactSearchRadius({ km: 25 }), {});
});

test("changing radius keeps all unrelated URL fields, restarts pagination, and does not mutate prior history", () => {
  const previous = Object.freeze({ q: "Winnipeg", km: 25, radius: 50, page: 3, spoken: "fr", meals: "1", diet: "nut-free", licence: "centre", age: "infant", from: "2027-01-15", sort: "distance", fac: "family_home", work: "Downtown", custom: "keep" });
  const changed = radius.withSearchRadius(previous, 5);
  assert.equal(changed.km, 5);
  assert.equal(changed.page, undefined);
  assert.equal(changed.radius, undefined);
  assert.equal(previous.km, 25);
  assert.equal(previous.page, 3);
  for (const key of ["q", "spoken", "meals", "diet", "licence", "age", "from", "sort", "fac", "work", "custom"]) assert.equal(changed[key], previous[key], key);
  assert.equal(radius.withSearchRadius(changed, 25).km, undefined);
});

test("home search serializes selected radius for English and French before navigation", () => {
  for (const locale of ["en", "fr"]) {
    let navigation;
    const goSearch = routeFunction("goSearch", { locale, radiusKm: 5, navigate: (next) => { navigation = next; } }, "index");
    // N-39 mockup 1: the home pill's Where/When/Who answers arrive as mobileSearchParams.
    goSearch(" Winnipeg ", { q: " Winnipeg ", from: "2027-01-15", to: "2027-02-15", age: "infant", ages: "infant", sched: "full", subsidy: "1" });
    assert.equal(navigation.to, locale === "fr" ? "/fr/search" : "/search");
    assert.equal(navigation.search.km, 5);
    assert.equal(navigation.search.q, "Winnipeg");
    assert.equal(navigation.search.from, "2027-01-15");
    assert.equal(navigation.search.to, "2027-02-15");
    assert.equal(navigation.search.age, "infant");
    assert.equal(navigation.search.ages, "infant");
    assert.equal(navigation.search.sched, "full");
    assert.equal(navigation.search.subsidy, "1");
    assert.equal("mi" in navigation.search, false);
    // The default 25 km stays out of the URL; "See all" passes only the area.
    const plain = routeFunction("goSearch", { locale, radiusKm: 25, navigate: (next) => { navigation = next; } }, "index");
    plain("Winnipeg, MB");
    assert.deepEqual({ ...navigation.search }, { q: "Winnipeg, MB" });
  }
});

test("first server search read uses the URL radius without a later client correction", async () => {
  for (const [search, expected] of [[{ q: "Winnipeg", km: "5" }, 5], [{ q: "Winnipeg", radius: "10" }, 10], [{ q: "Winnipeg" }, 25]]) {
    const reads = [];
    const load = routeFunction("searchLoader", {
      ratingFloor: () => 0, MIN_REVIEW_COUNT: 3, isGenericCareQuery: () => false,
      searchQueryFromUnknown: (input) => input.q, cityParamFromUnknown: () => "",
      resolveSearchDirectory: () => ({ kind: "known" }),
      originFromSearchQuery: () => ({ lat: 49.8951, lng: -97.1384, label: "Winnipeg, MB" }),
      DEFAULT_SEARCH_SORT: "best", listedDaycareTypeFromSearch: () => undefined,
      normalizeSearchResultFilters: (value) => value, schoolAgeOnlyFromSearch: () => false,
      indexedPlaceQuery: () => true, SQL_SETTLE_MS: 0,
      createSearchLoaderRead: () => ({ signal: undefined, finish: () => {} }),
      withTimeoutFallback: (promise) => promise,
      searchDaycarePage: async ({ data }) => {
        reads.push(data);
        return { items: [{ id: "synthetic" }], total: 1, page: 1, evidence: {} };
      },
      readSearchEvidence: (value) => value,
    });
    const result = await load({ location: { search } });
    assert.equal(reads.length, 1);
    assert.equal(reads[0].radiusKm, expected);
    assert.equal(result.total, 1);
  }
});

test("radius validation leaves the existing supported search fields intact", () => {
  const validate = routeFunction("searchValidateSearch");
  const input = { q: "Winnipeg", km: "5", spoken: "fr", meals: "1", diet: "nut-free", licence: "centre", age: "infant", from: "2027-01-15", sort: "distance", page: 2 };
  const { km, ...after } = JSON.parse(JSON.stringify(validate(input)));
  const { km: _ignored, ...before } = JSON.parse(JSON.stringify(validate({ ...input, km: undefined })));
  assert.deepEqual(after, before);
  assert.equal(km, 5);
});

function parentFilterWriter(incoming) {
  let navigation;
  const parentFilters = dependencies.parseParentListingSearch(incoming);
  const withParentSearch = routeFunction("withParentSearch", { incoming, parentFilters });
  const listingPageSearch = routeFunction("listingPageSearch", { incoming, parentFilters, withParentSearch, liveOn: true, dietParam: incoming.diet });
  const write = routeFunction("writeParentFilters", {
    incoming, query: "Winnipeg", liveOn: true, listingPageSearch,
    navigate: (next) => { navigation = next; },
  });
  return (next) => { write(next); return navigation.search; };
}

test("applying a Schedule choice preserves the existing radius, language and advanced filters", () => {
  const incoming = {
    q: "Winnipeg", city: "Winnipeg", km: 5, page: 3, spoken: "fr", meals: "1",
    cwelcc: "1", inclusive: "1", subsidy: "1", diet: "nut-free", licence: "centre",
    age: "infant", from: "2027-01-15", to: "2027-02-15", sort: "distance", rank: "nearest",
    favorites: "1", live: 1, openings: "1", start: "this-month", sched: "part", fac: "family_home",
  };
  const write = parentFilterWriter(incoming);
  const changed = write({ ...dependencies.parseParentListingSearch(incoming), sched: ["full"] });
  assert.equal(changed.sched, "full");
  assert.equal(changed.page, undefined);
  for (const key of ["q", "city", "km", "spoken", "meals", "cwelcc", "inclusive", "subsidy", "diet", "licence", "age", "from", "to", "sort", "rank", "favorites", "openings", "start"]) assert.equal(changed[key], incoming[key], key);
  assert.equal(changed.fac, "family_home");
});

test("clearing parent filter choices removes old selections while retaining unrelated filters", () => {
  const incoming = { q: "Winnipeg", km: 5, page: 3, spoken: "fr", meals: "1", diet: "nut-free", licence: "centre", ages: "infant", open: "waitlist", sched: "part", fac: "family_home" };
  const changed = parentFilterWriter(incoming)({ ages: [], open: [], sched: [], fac: [] });
  for (const key of ["ages", "open", "sched", "fac", "page"]) assert.equal(changed[key], undefined, key);
  for (const key of ["q", "km", "spoken", "meals", "diet", "licence"]) assert.equal(changed[key], incoming[key], key);
});
