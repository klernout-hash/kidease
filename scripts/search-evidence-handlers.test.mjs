import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { mergeSearchEvidence, searchEvidence, withSearchRows } from "../src/lib/search-evidence.ts";
import { pageFromSearch, SEARCH_PAGE_SIZE, sliceSearchPage } from "../src/lib/search-page.ts";
import { flushSearchMemo, rememberSearch, searchMemoKey } from "../src/lib/server/search-memo.ts";

await register(new URL("./alias-loader.mjs", import.meta.url), import.meta.url);
const [predicates, privacy, geo, proximity, anchors, fit, care, inclusive, query, sort, explore, trust, locks, readiness, categories, photos] = await Promise.all([
  import("../src/lib/search-result-filters.ts"), import("../src/lib/home-address-seal.ts"),
  import("../src/lib/geo.ts"), import("../src/lib/proximity.ts"), import("../src/lib/dual-anchor.ts"),
  import("../src/lib/parent-fit.ts"), import("../src/lib/care-type.ts"), import("../src/lib/inclusive-search.ts"),
  import("../src/lib/search-query.ts"), import("../src/lib/search-sort.ts"),
  import("../src/lib/explore-search.ts"), import("../src/lib/trust.ts"), import("../src/lib/location-lock.ts"),
  import("../src/lib/listing-readiness.ts"), import("../src/lib/explore-categories.ts"), import("../src/lib/listing-photo.ts"),
]);
const [visibility, live, approve, culture, parentListing, standardAges, times, tours, quality, paid, utils, retrieval] = await Promise.all([
  import("../src/lib/listing-visibility.ts"), import("../src/lib/live.ts"), import("../src/lib/approve-live.ts"),
  import("../src/lib/listing-culture.ts"), import("../src/lib/parent-listing.ts"), import("../src/lib/standard-age-groups.ts"),
  import("../src/lib/sort-time.ts"), import("../src/lib/tour-calendar.ts"), import("../src/lib/search-result-quality.ts"),
  import("../src/lib/provider-entitlements.ts"), import("../src/lib/utils.ts"), import("../src/lib/search-retrieval.ts"),
]);
const { includeCardInRadius } = await import("../src/lib/card-distance.ts");

const ORIGIN = { lat: 49.5, lng: -117.28 };
const INPUT = { ...ORIGIN, radiusKm: 25, sort: "distance", ageGroup: "any", label: "Nelson, BC" };

function card(id, extra = {}) {
  return {
    id, slug: id, name: "Cornerstone Childcare", nameFr: "Garderie Cornerstone",
    lat: ORIGIN.lat + 0.01, lng: ORIGIN.lng + 0.01, city: "Nelson", province: "BC",
    address: "123 Care Street", postalCode: "V1L 1A1", languages: "English,French",
    staffLanguages: [], amenities: "", hours: "08:00-17:00", photos: [],
    agesKnown: true, ageMinMonths: 0, ageMaxMonths: 60, licenseNumber: "BC-123",
    claimed: true, claimStatus: "verified", live: true, isTest: false,
    availabilityKnown: false, spotsInfant: 0, spotsToddler: 0, spotsPreschool: 0,
    facilityType: "child_care_centre", financial: {}, scheduleOptions: [], ...extra,
  };
}

function batch(rows, evidence = {}) {
  return { rows, evidence: searchEvidence({ status: "complete", source: "primary", retryable: false, observedAt: 100, ...evidence }) };
}

function languageFixture() {
  return [
    ...Array.from({ length: 110 }, (_, index) => card(`en-${index}`, { languages: "English" })),
    ...Array.from({ length: 125 }, (_, index) => card(`fr-${index}`)),
    card("fr-outside-radius", { lat: ORIGIN.lat + 0.4 }),
  ];
}

/** Extract declarations by AST name: execute production bodies without importing SQL/server startup. */
function declarations(file, names, deps, internals = []) {
  const path = new URL(`../src/lib/${file}`, import.meta.url);
  const source = ts.createSourceFile(path.pathname, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const wanted = new Set(names);
  const selected = source.statements.filter((node) => {
    if (ts.isFunctionDeclaration(node)) return wanted.has(node.name?.text);
    return ts.isVariableStatement(node) && node.declarationList.declarations.some((decl) => ts.isIdentifier(decl.name) && wanted.has(decl.name.text));
  });
  assert.equal(selected.length, names.length, `production declarations changed in ${file}`);
  const compiled = ts.transpileModule(selected.map((node) => node.getText(source)).join("\n"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const context = vm.createContext({ exports: {}, ...deps });
  new vm.Script(`${compiled}\nglobalThis.__internal = { ${internals.join(",")} };`, { filename: path.pathname }).runInContext(context);
  return { ...context.exports, ...context.__internal };
}

function createServerFn() {
  return {
    validator(validate) {
      return { handler: (handle) => async ({ data }) => handle({ data: validate(data) }) };
    },
  };
}

function handlerHarness(initialBatch, overrides = {}) {
  flushSearchMemo();
  const state = { batch: initialBatch, builds: [], memos: [], seals: [], projections: [] };
  const seal = (value) => Array.isArray(value)
    ? privacy.sealHomeRecords(value, privacy.GUEST_HOME_VIEWER)
    : { ...value, items: privacy.sealHomeRecords(value.items, privacy.GUEST_HOME_VIEWER) };
  const deps = {
    createServerFn, pageFromSearch, sliceSearchPage, searchMemoKey,
    parseSearchSort: sort.parseSearchSort, parseAnchorMode: anchors.parseAnchorMode,
    parseParentFit: fit.parseParentFit, parentFitCacheKey: fit.parentFitCacheKey,
    parseCareKeys: inclusive.parseCareKeys, geocode: geo.geocode, clampRadiusKm: proximity.clampRadiusKm,
    readLiveSearchFlag: explore.readLiveSearchFlag, listedDaycareTypeFromSearch: care.listedDaycareTypeFromSearch,
    alignSearchOrigin: query.alignSearchOrigin, isClaimVerified: trust.isClaimVerified,
    ...predicates, withSearchRows, inclusiveFiltersEnabled: () => true,
    ClientInputError: class extends Error {},
    appendTestAccountFixtures: async (_input, rows) => rows,
    searchIncludingLive: async (input) => { state.builds.push(input); return state.batch; },
    rememberSearch: async (key, build, options) => {
      state.memos.push({ key, options });
      return rememberSearch(key, build, options);
    },
    sealPublicHomes: async (value) => { state.seals.push(value); return seal(value); },
    projectSearchMapPins: (rows) => { state.projections.push(rows); return predicates.projectSearchMapPins(rows); },
    ...overrides,
  };
  const api = declarations("server/daycares.ts", [
    "parseSort", "parseRankAge", "parseSchedules", "optionalCoord", "alignedSearchInput",
    "normalizeSearchInput", "rankedSearchMemoKey", "filteredSearchRows", "searchDaycarePage", "searchDaycareMap",
  ], deps, ["filteredSearchRows"]);
  return { api, state };
}

test("actual list/map handlers filter before paging and preserve capped evidence across 235 language candidates", async () => {
  const source = batch(languageFixture(), { status: "partial", reasons: ["candidate-limit"] });
  const { api, state } = handlerHarness(source);
  const data = { ...INPUT, filters: { pioneer: { spoken: "fr" } } };
  const first = await api.searchDaycarePage({ data });
  const second = await api.searchDaycarePage({ data: { ...data, page: "2" } });
  const map = await api.searchDaycareMap({ data });
  assert.equal(first.items.length, SEARCH_PAGE_SIZE);
  assert.equal(second.items.length, 29);
  assert.equal(first.total, 125);
  assert.equal(second.total, 125);
  assert.equal(map.total, 125);
  assert.equal(map.pins.length, 125);
  assert.equal(first.items[0].id, "fr-0");
  assert.equal(second.items[0].id, "fr-96");
  assert.deepEqual([...first.items, ...second.items].map((row) => row.id), map.pins.map((row) => row.id));
  for (const result of [first, second, map]) {
    assert.equal(result.evidence, source.evidence);
    assert.equal(result.evidence.totalKind, "at-least");
    assert.equal(result.evidence.observedAt, 100);
  }
  assert.equal(state.builds.length, 1, "list pages and map share the unfiltered candidate memo");
  const english = await api.searchDaycarePage({ data: { ...INPUT, filters: { pioneer: { spoken: "en" } } } });
  assert.equal(english.total, 235, "a previous French read must not narrow cached candidates");
});

test("actual filtering cannot upgrade partial zero or snapshot fallback into an exact total", async () => {
  for (const evidence of [
    { status: "partial", source: "primary", reasons: ["candidate-limit"] },
    { status: "unverified", source: "snapshot", reasons: ["source-fallback"], retryable: true },
  ]) {
    const source = batch(languageFixture(), evidence);
    const { api } = handlerHarness(source);
    const data = { ...INPUT, filters: { name: "No matching centre" } };
    const page = await api.searchDaycarePage({ data });
    const map = await api.searchDaycareMap({ data });
    assert.equal(page.total, 0);
    assert.equal(map.total, 0);
    assert.equal(map.pins.length, 0);
    assert.equal(page.evidence.status, evidence.status);
    assert.equal(page.evidence.totalKind, evidence.source === "snapshot" ? "available" : "at-least");
    assert.notEqual(page.evidence.totalKind, "exact");
    assert.equal(map.evidence, source.evidence);
    const matching = await api.searchDaycarePage({ data: { ...INPUT, filters: { pioneer: { spoken: "fr" } } } });
    assert.equal(matching.total, 125);
    assert.equal(matching.evidence.totalKind, evidence.source === "snapshot" ? "available" : "at-least");
    assert.equal(matching.evidence.observedAt, source.evidence.observedAt);
  }
});

test("refresh reaches the actual candidate builder and memo options without reusing an older successful generation", async () => {
  const { api, state } = handlerHarness(batch([card("cached")], { observedAt: 10 }));
  const first = await api.searchDaycarePage({ data: INPUT });
  state.batch = batch([card("refreshed")], { observedAt: 20 });
  const cached = await api.searchDaycareMap({ data: INPUT });
  assert.equal(cached.pins[0].id, "cached");
  assert.equal(cached.evidence.observedAt, first.evidence.observedAt);
  const fresh = await api.searchDaycareMap({ data: { ...INPUT, refresh: true, countDemand: true } });
  assert.equal(fresh.pins[0].id, "refreshed");
  assert.equal(fresh.evidence.observedAt, 20);
  assert.equal(state.builds.length, 2);
  assert.equal(state.builds[1].refresh, true);
  assert.equal(state.builds[1].countDemand, false, "map retries do not count interactive demand");
  assert.equal(state.memos.at(-1).options.refresh, true);
  assert.equal(state.memos.at(-1).options.cacheIf(state.batch), true);
  const retryable = batch([], { status: "unverified", source: "snapshot", reasons: ["source-fallback"], retryable: true });
  assert.equal(state.memos.at(-1).options.cacheIf(retryable), false);
});

test("map handler seals full home records before projecting public pins", async () => {
  const home = card("private-home", { facilityType: "family_home", amenities: "home", showPublicAddress: false });
  const { api, state } = handlerHarness(batch([home, card("no-pin", { lat: 0, lng: 0 })]));
  const map = await api.searchDaycareMap({ data: INPUT });
  assert.equal(map.total, 2, "unplaceable records remain in the same list total");
  assert.equal(map.pins.length, 1);
  assert.equal(state.seals[0][0].facilityType, "family_home", "privacy classification must survive until sealing");
  assert.equal(state.seals[0][0].address, "123 Care Street");
  assert.equal(state.projections[0][0].addressProtected, true);
  assert.equal(state.projections[0][0].address, "");
  assert.equal(map.pins[0].protectedHome, true);
  assert.equal(map.pins[0].address, "");
  assert.equal(map.pins[0].postalCode, "V1L");
  assert.notEqual(map.pins[0].lat, home.lat);
  assert.notEqual(map.pins[0].lng, home.lng);
  assert.ok(map.pins[0].radiusM >= 500);
  assert.equal(home.address, "123 Care Street", "source candidates are not mutated");
});

test("school-age URL gate is identical in actual loader and initial client expressions", () => {
  const routeText = readFileSync(new URL("../src/routes/search.tsx", import.meta.url), "utf8");
  const source = ts.createSourceFile("search.tsx", routeText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let loaderGate;
  let initialGate;
  function visit(node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(source) === "schoolAgeOnly") loaderGate = node.initializer;
    if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name) && node.name.elements[0]?.getText(source) === "schoolAgeOnly") initialGate = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(loaderGate && initialGate, "execute both actual route callsites");
  for (const [search, expected] of [
    [{ age: "school-age" }, true], [{ cat: "school-age" }, true],
    [{ age: "infant,school-age" }, false], [{ age: "infant" }, false], [{}, false],
  ]) {
    const context = vm.createContext({
      schoolAgeOnlyFromSearch: predicates.schoolAgeOnlyFromSearch,
      searchRecord: search, incoming: search, useState: (initialize) => initialize(),
    });
    const loader = new vm.Script(`(${loaderGate.getText(source)})`).runInContext(context);
    const client = new vm.Script(`(${initialGate.getText(source)})`).runInContext(context);
    assert.equal(loader, expected);
    assert.equal(client, loader);
    const unknown = card("unknown-age", { agesKnown: false, ageMinMonths: 0, ageMaxMonths: 0 });
    const school = card("school-age", { ageMinMonths: 72, ageMaxMonths: 144 });
    const filter = (strict) => predicates.filterSearchResults([unknown, school], {
      origin: ORIGIN, radiusKm: 25,
      filters: { ages: categories.parseExploreRailAges(search), schoolAgeOnly: strict },
    });
    assert.deepEqual(filter(loader).map((row) => row.id), filter(client).map((row) => row.id));
    if (expected) assert.deepEqual(filter(loader).map((row) => row.id), ["school-age"], "retain the existing strict school-age policy");
  }
});

test("actual name mapper restores claimed vacancy proof before list/count/map predicates", async () => {
  const now = Date.now();
  const freshAt = new Date(now).toISOString();
  const fresh = card("fresh", { availabilityKnown: true, lastVacancyUpdatedAt: freshAt, spotsInfant: 2, reviews: [] });
  const stale = card("stale", { availabilityKnown: true, lastVacancyUpdatedAt: "2020-01-01T00:00:00Z", spotsInfant: 2, reviews: [] });
  const unknown = card("unknown", { claimed: false, live: false, reviews: [] });
  const remote = card("remote", { ...fresh, id: "remote", slug: "remote", lat: ORIGIN.lat + 1, reviews: [] });
  const rows = [fresh, stale, unknown, remote];
  const claimed = new Map([fresh, stale, remote].map((row) => [row.id, row]));
  let overlayCalls = 0;
  const amounts = declarations("server/map-row.ts", ["fromPrice", "spotsTotal"], {});
  const api = declarations("server/daycares.ts", ["toDaycare", "toCard", "mergeClaimedCard", "slimCard", "searchByName"], {
    ...amounts, ...trust, ...readiness, withSearchRows, mergeSearchEvidence, publicListings: (items) => items, isPublicListing: () => true,
    applyLocalRegistryTrust: (row) => row, applyMasterCareType: (row) => row,
    isPlatformLive: (_id, isClaimed) => isClaimed, isAdminOnlyListing: () => false,
    hasLicenceEvidence: (row) => Boolean(row.licenseNumber), resolveListingTourTimezone: () => "America/Vancouver",
    cardSortKm: geo.haversineKm, catchmentMatch: proximity.catchmentMatch, listingThumb: photos.listingThumb,
    filterByDaycareName: explore.filterByDaycareName,
    require: (name) => {
      assert.equal(name, "@/lib/server/catalog-neon");
      return {
        queryNeonPublicNameIndexResult: async () => batch(rows.map((row) => ({ id: row.id, name: row.name, name_fr: row.nameFr }))),
        queryNeonListingsByIdsResult: async () => batch(rows),
      };
    },
    getPublicCatalogResult: async () => assert.fail("successful primary fixture must not fall back"),
    stampPaidPlacement: async (items) => items,
    overlayClaimedSearchResult: async (items, merge) => {
      overlayCalls++;
      assert.equal(items.find((row) => row.id === "fresh").lastVacancyUpdatedAt, null, "execute the actual catalogue mapper before enrichment");
      return batch(items.map((item) => claimed.has(item.id) ? merge(item, claimed.get(item.id)) : item));
    },
  }, ["searchByName"]);
  const input = { ...INPUT, name: "Cornerstone", filters: { openings: true, confirmedOnly: true } };
  const { api: handlers } = handlerHarness(batch([]), { searchIncludingLive: api.searchByName });
  const page = await handlers.searchDaycarePage({ data: input });
  const map = await handlers.searchDaycareMap({ data: input });
  assert.equal(overlayCalls, 1, "list and map share one enriched candidate memo");
  assert.deepEqual(Array.from(page.items, (row) => row.id), ["fresh"]);
  assert.equal(page.total, 1);
  assert.equal(map.total, 1);
  assert.deepEqual(Array.from(map.pins, (row) => row.id), ["fresh"]);
  assert.equal(page.items[0].lastVacancyUpdatedAt, freshAt);
  assert.equal(page.items[0].availabilityKnown, true);
});

function claimedPipelineHarness(sourceRows, claimedRows) {
  const state = { queries: [], heavy: [], fail: false, builds: 0 };
  const mapperDeps = {
    ...trust, ...readiness, ...visibility, ...live, ...approve, ...culture, ...parentListing,
    ...standardAges, ...times, ...tours, splitPhotoList: photos.splitPhotoList,
    foundingBadgeEnabled: () => false, foundingMemberVisible: () => false,
    applyLocalRegistryTrust: (row) => row, applyMasterCareType: (row) => row,
  };
  const mapper = declarations("server/map-row.ts", ["cadAmount", "mapDaycare", "fromPrice", "spotsTotal"], mapperDeps);
  const cap = declarations("server/catalog-neon.ts", ["CITY_TYPE_LIST_CAP"], {}).CITY_TYPE_LIST_CAP;
  const module = { exports: {} };
  const helper = readFileSync(new URL("../src/lib/server/search-claim-overlay.ts", import.meta.url), "utf8");
  new vm.Script(ts.transpileModule(helper, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText).runInNewContext({
    module, exports: module.exports, setTimeout, clearTimeout, Date,
    require: (name) => {
      if (name === "@/lib/search-evidence") return { searchEvidence };
      if (name === "./catalog-neon") return { CITY_TYPE_LIST_CAP: cap };
      if (name === "./map-row") return mapper;
      assert.equal(name, "@/lib/db");
      return { dbSource: "neon", getSqlWithin: async () => ({ query: async (text, [ids]) => {
        assert.match(text, /claimed_at is not null and id = any\(\$1::text\[\]\)/);
        state.queries.push([...ids]);
        if (state.fail) throw new Error("fixture claimed read unavailable");
        return claimedRows.filter((row) => ids.includes(row.id));
      } }) };
    },
  });
  const api = declarations("server/daycares.ts", [
    "toDaycare", "toCard", "mergeClaimedCard", "slimCard", "smartQuery", "runSearch", "searchByName", "liveCardsForSearchResult",
  ], {
    ...mapperDeps, ...mapper, ...anchors, ...locks, ...fit, ...care, ...quality, ...paid, ...utils,
    compareProximity: proximity.compareProximity, recommendedRank: proximity.recommendedRank,
    catchmentMatch: proximity.catchmentMatch, cardSortKm: geo.haversineKm, includeCardInRadius,
    withSearchRows, mergeSearchEvidence, searchEvidence,
    cityHubDefBySlug: () => null,
    nearbyListingsResult: async () => { state.builds++; return batch(sourceRows); },
    mergeApprovedCityListingsResult: async (input) => input.rows.length ? input : batch(sourceRows),
    withNamedCityListings: async (input) => input, mergePinnedSearchCentres: async (input) => input,
    overlayClaimedSearchResult: module.exports.overlayClaimedSearchResult,
    overlayParentReviews: async (items) => { state.heavy.push(items.map((row) => row.id)); return items; },
    overlayQuality: async (items) => items, overlayParentRank: async (items) => items,
    overlayFeaturedCity: async (items) => items, sponsoredPinsFirst: () => false,
    rankingV2Enabled: () => false, withProvincial: async (items) => items,
    listingThumb: photos.listingThumb, filterByDaycareName: explore.filterByDaycareName,
    stampPaidPlacement: async (items) => items,
    require: (name) => {
      assert.equal(name, "@/lib/server/catalog-neon");
      return {
        queryNeonPublicNameIndexResult: async () => batch(sourceRows.map((row) => ({ id: row.id, name: row.name }))),
        queryNeonListingsByIdsResult: async () => batch(sourceRows),
      };
    },
  }, ["runSearch", "searchByName", "liveCardsForSearchResult"]);
  return { api, state };
}

function pipelineFixture() {
  const now = new Date().toISOString();
  const rows = Array.from({ length: 350 }, (_, index) => card(`centre-${index}`, {
    name: `Alpha Centre ${String(index).padStart(4, "0")}`, reviews: [], claimed: false, live: false,
    claimStatus: null, ratingX10: 0, reviewCount: 0, infantMonthly: null, toddlerMonthly: null,
    preschoolMonthly: null, partTimeMonthly: null,
  }));
  const database = (index, extra = {}) => ({
    id: rows[index].id, slug: rows[index].slug, name: rows[index].name, name_fr: "",
    tagline: "", tagline_fr: "", description: "", description_fr: "",
    address: `${index} Care Street`, city: "Nelson", province: "BC", postal_code: "V1L 1A1",
    lat: rows[index].lat, lng: rows[index].lng, phone: null, hours: "08:00-17:00", hours_fr: "",
    age_min_months: 0, age_max_months: 60, ages_confirmed: true,
    infant_monthly: 100, toddler_monthly: null, preschool_monthly: null, part_time_monthly: null,
    spots_infant: 2, spots_toddler: 0, spots_preschool: 0, waitlist: 0,
    rating_x10: 45, review_count: 1, license_number: "BC-123", languages: "English,French",
    amenities: "licensed", photos: "", verified: 1, claimed_at: now, claim_status: "approved",
    listing_active: 1, visibility: "public", is_test: 0, last_vacancy_updated_at: now,
    facility_type: "child_care_centre", schedule_options: '["full"]', opening_window: "immediate",
    ...extra,
  });
  const claimed = Array.from({ length: 125 }, (_, offset) => database(192 + offset));
  // Updating a tail name must not change which cards receive expensive overlays.
  claimed[0].name = "A Claimed Tail Centre";
  claimed.push(database(317, { visibility: "admin_only" }), database(318, { is_test: 1 }), database(319, { listing_active: 0 }));
  claimed.push(database(320, { open_spots_hidden_at: now }));
  claimed.push(database(321, { spots_infant: 0, waitlist: 1 }));
  claimed.push(database(322, { last_vacancy_updated_at: "2020-01-01T00:00:00Z" }));
  return { rows, claimed };
}

test("actual normal search hydrates qualifying tail rows before every page/map predicate and keeps the expensive head", async () => {
  const fixture = pipelineFixture();
  const pipeline = claimedPipelineHarness(fixture.rows, fixture.claimed);
  const { api } = handlerHarness(batch([]), { searchIncludingLive: pipeline.api.runSearch });
  const input = { ...INPUT, sort: "price" };
  const unfiltered = await api.searchDaycarePage({ data: input });
  assert.equal(unfiltered.items[0].fromPrice, 100, "existing price comparator sees authoritative tail fees");
  const filters = { openings: true, confirmedOnly: true };
  const first = await api.searchDaycarePage({ data: { ...input, filters } });
  const second = await api.searchDaycarePage({ data: { ...input, filters, page: 2 } });
  const map = await api.searchDaycareMap({ data: { ...input, filters } });
  assert.equal(first.items.length, 96);
  assert.equal(second.items.length, 29);
  assert.equal(first.total, 125);
  assert.equal(map.total, 125);
  assert.equal(map.pins.length, 125);
  assert.deepEqual([...first.items, ...second.items].map((row) => row.id), Array.from(map.pins, (row) => row.id));
  assert.equal(pipeline.state.builds, 1, "warm unfiltered candidates remain fully enriched for later predicates");
  assert.deepEqual(pipeline.state.queries.map((ids) => ids.length), [192, 158]);
  assert.deepEqual(Array.from(pipeline.state.heavy[0]), fixture.rows.slice(0, 192).map((row) => row.id));
  assert.equal(first.evidence.totalKind, "exact");
  const waitlist = await api.searchDaycarePage({ data: { ...input, filters: { availability: "waitlist" } } });
  assert.deepEqual(Array.from(waitlist.items, (row) => row.id), ["centre-321"]);
  const unknown = await api.searchDaycarePage({ data: { ...input, filters: { availability: "unknown" } } });
  assert.ok(!unknown.items.some((row) => row.id === "centre-192"), "fresh tail must not become a false unknown match");
  assert.equal(fixture.rows[192].claimed, false, "source candidates are unchanged");
});

test("normal/name/live paths carry reader failures through memo and refresh with no hidden/test restoration", async () => {
  for (const path of ["runSearch", "searchByName", "liveCardsForSearchResult"]) {
    const fixture = pipelineFixture();
    const pipeline = claimedPipelineHarness(fixture.rows, fixture.claimed);
    pipeline.state.fail = true;
    const { api } = handlerHarness(batch([]), { searchIncludingLive: pipeline.api[path] });
    const input = { ...INPUT, ...(path === "searchByName" ? { name: "Alpha" } : {}), filters: { openings: true } };
    const failed = await api.searchDaycarePage({ data: input });
    assert.equal(failed.total, 0);
    assert.equal(failed.evidence.status, "unverified");
    assert.equal(failed.evidence.totalKind, "available");
    assert.equal(failed.evidence.retryable, true);
    pipeline.state.fail = false;
    const recovered = await api.searchDaycarePage({ data: input });
    assert.equal(recovered.evidence.status, "complete", "a failed enriched generation is not memoized");
    const fresh = await api.searchDaycarePage({ data: { ...input, refresh: true } });
    const map = await api.searchDaycareMap({ data: input });
    assert.equal(fresh.total, path === "searchByName" ? 124 : 125);
    assert.equal(map.total, fresh.total);
    assert.equal(map.pins.length, fresh.total);
    assert.equal(fresh.evidence.status, "complete");
    assert.ok(![...fresh.items, ...map.pins].some((row) => ["centre-317", "centre-318", "centre-319"].includes(row.id)));
    assert.equal(pipeline.state.queries.length, 5, "one failed query, recovered two-chunk generation, forced fresh two-chunk generation; map reuses successful memo");
  }
});

test("full/live union cannot restore an ID that either successful read proves nonpublic", async () => {
  const hiddenId = "centre-hidden-latest";
  const failed = batch([card(hiddenId), card("fallback-visible")], {
    status: "unverified", reasons: ["supplement-unavailable"], retryable: true,
  });
  const verified = { ...batch([card("primary-visible")]), excludedIds: [hiddenId] };
  for (const [full, liveResult] of [[verified, failed], [failed, verified]]) {
    const api = declarations("server/daycares.ts", ["searchIncludingLive"], {
      resolveSearchDirectory: () => ({ kind: "nearby" }), alignedSearchInput: (input) => input,
      liveCardsForSearchResult: async () => liveResult, runSearch: async () => full,
      settleSearchRead: async (promise) => ({ kind: "result", batch: await promise }),
      combineSearchReads: retrieval.combineSearchReads, LOADER_SETTLE_MS: 6000,
      uniqueById: utils.uniqueById, withSearchRows,
    }, ["searchIncludingLive"]);
    const result = await api.searchIncludingLive(INPUT);
    assert.deepEqual(Array.from(result.rows, (row) => row.id).sort(), ["fallback-visible", "primary-visible"]);
    assert.deepEqual(Array.from(result.excludedIds), [hiddenId]);
    assert.equal(result.evidence.totalKind, "available");
  }
});

function featuredHarness({ rows = [], failure = false, live = true } = {}) {
  const calls = { sql: [], errors: [], getSql: 0 };
  const api = declarations("server/provider-entitlements.ts", ["featuredCentreIdsInLock", "featuredCentreIdsInLockResult"], {
    searchEvidence, listingMatchesLocationLock: locks.listingMatchesLocationLock, stripeChargesLive: () => live,
    console: { error: (...args) => calls.errors.push(args) },
    getSql: async () => {
      calls.getSql++;
      if (failure) throw new Error("mock database unavailable");
      return async (parts, ...values) => { calls.sql.push({ text: parts.join("?"), values }); return rows; };
    },
  });
  return { api, calls };
}

const LOCK = { province: "BC", city: "Nelson", metroKeys: ["nelson"] };

test("actual featured lookup distinguishes successful empty eligibility from an unavailable supplement", async () => {
  const empty = featuredHarness();
  const emptyResult = await empty.api.featuredCentreIdsInLockResult(LOCK);
  assert.equal(emptyResult.rows.length, 0);
  assert.equal(emptyResult.evidence.status, "complete");
  assert.equal(emptyResult.evidence.totalKind, "exact");
  assert.equal(emptyResult.evidence.retryable, false);
  const failed = featuredHarness({ failure: true });
  const missing = await failed.api.featuredCentreIdsInLockResult(LOCK);
  assert.equal(missing.rows.length, 0);
  assert.equal(missing.evidence.status, "partial");
  assert.equal(missing.evidence.totalKind, "at-least");
  assert.equal(missing.evidence.retryable, true);
  assert.deepEqual(Array.from(missing.evidence.reasons), ["supplement-unavailable"]);
  assert.equal(failed.calls.errors.length, 1);
  assert.equal((await failed.api.featuredCentreIdsInLock(LOCK)).length, 0, "legacy rows wrapper stays compatible");
});

test("featured lookup retains paid eligibility SQL and city/province locking", async () => {
  const { api, calls } = featuredHarness({ rows: [
    { id: "local", city: "Nelson", province: "BC" },
    { id: "wrong-province", city: "Nelson", province: "MB" },
    { id: "wrong-city", city: "Vancouver", province: "BC" },
  ] });
  const result = await api.featuredCentreIdsInLockResult(LOCK);
  assert.deepEqual(Array.from(result.rows), ["local"]);
  assert.equal(result.evidence.status, "complete");
  const sql = calls.sql[0].text;
  assert.match(sql, /pr\.selected_plan = 'pro' and pr\.stripe_subscription_status in \('active', 'trialing', 'past_due'\)/);
  assert.match(sql, /pr\.featured_city_status in \('active', 'trialing', 'past_due'\)/);
  assert.match(sql, /position\('featured_city' in coalesce\(pr\.selected_addons, ''\)\) > 0/);
  assert.match(sql, /pr\.featured_city_centre_id is null or pr\.featured_city_centre_id = d\.id/);
  for (const setup of [{ live: false }, {}]) {
    const disabled = featuredHarness(setup);
    const noLookup = await disabled.api.featuredCentreIdsInLockResult(setup.live === false ? LOCK : null);
    assert.equal(disabled.calls.getSql, 0);
    assert.equal(noLookup.evidence.status, "complete");
  }
});
