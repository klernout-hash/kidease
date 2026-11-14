import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { SEARCH_PAGE_SIZE, SEARCH_PAGE_MAX, pageFromSearch, parseSearchPage, sliceSearchPage } from "../src/lib/search-page.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("search pages are 96 cards of the same sorted list", () => {
  const rows = Array.from({ length: 200 }, (_, i) => ({ id: `c${i}` }));
  const first = sliceSearchPage(rows, 1);
  assert.equal(SEARCH_PAGE_SIZE, 96);
  assert.equal(first.items.length, 96);
  assert.equal(first.items[0].id, "c0");
  assert.equal(first.items.at(-1).id, "c95");
  assert.equal(first.hasMore, true);
  assert.equal(first.page, 1);
  assert.equal(first.total, 200);
  assert.equal(sliceSearchPage([], 1).total, 0);

  const second = sliceSearchPage(rows, 2);
  assert.equal(second.items[0].id, "c96");
  assert.equal(second.items.length, 96);
  assert.equal(second.hasMore, true);

  const last = sliceSearchPage(rows, 3);
  assert.equal(last.items.length, 8);
  assert.equal(last.items[0].id, "c192");
  assert.equal(last.hasMore, false);

  assert.equal(sliceSearchPage([], 1).hasMore, false);
  assert.deepEqual(sliceSearchPage(rows, 0).items[0], { id: "c0" });
});

test("page query stays in range", () => {
  assert.equal(parseSearchPage(undefined), 1);
  assert.equal(parseSearchPage("2"), 2);
  assert.equal(parseSearchPage(1.9), 1);
  assert.equal(parseSearchPage(0), 1);
  assert.equal(parseSearchPage(-4), 1);
  assert.equal(parseSearchPage("nope"), 1);
  assert.equal(parseSearchPage(40), 40);
  assert.equal(parseSearchPage(99), 40);
  assert.equal(pageFromSearch("?city=Winnipeg&page=2"), 2);
  assert.equal(pageFromSearch({ page: "3" }), 3);
  assert.equal(pageFromSearch({}), 1);
});

test("the page safety boundary stops navigation without hiding the known total", () => {
  const rows = Array.from({ length: 4000 }, (_, id) => ({ id }));
  const before = sliceSearchPage(rows, SEARCH_PAGE_MAX - 1);
  assert.equal(before.nextPage, SEARCH_PAGE_MAX);
  assert.equal(before.hasMore, true);
  const last = sliceSearchPage(rows, SEARCH_PAGE_MAX);
  assert.equal(last.total, 4000);
  assert.equal(last.items.length, SEARCH_PAGE_SIZE);
  assert.equal(last.nextPage, null);
  assert.equal(last.hasMore, false);
  assert.equal(last.pageLimitReached, true);
  assert.equal(sliceSearchPage(rows, SEARCH_PAGE_MAX + 1).nextPage, null);
  const exhausted = sliceSearchPage(rows.slice(0, SEARCH_PAGE_MAX * SEARCH_PAGE_SIZE), SEARCH_PAGE_MAX);
  assert.equal(exhausted.pageLimitReached, false);
});

test("public search routes page the payload and keep a crawlable next link", () => {
  const search = src("src/routes/search.tsx");
  const french = src("src/routes/fr.search.tsx");
  const daycares = src("src/lib/server/daycares.ts");
  assert.match(search, /searchDaycarePage/);
  assert.match(search, /resultTotal/);
  assert.match(search, /ParentHelperPanel collapsed/);
  assert.match(french, /SearchScreen/);
  assert.doesNotMatch(search, /searchDaycares\(/);
  assert.match(search, /showMoreListings/);
  assert.match(search, /showPreviousListings/);
  assert.match(search, /listingPageSearch/);
  assert.match(french, /searchLoader/);
  assert.doesNotMatch(french, /searchDaycares\(/);
  assert.match(daycares, /export const searchDaycares = createServerFn\(\{ method: "GET" \}\)/);
  assert.match(daycares, /sliceSearchPage\(narrowed\.rows, page\)/);
  assert.match(daycares, /evidence: narrowed\.evidence/);
  assert.match(daycares, /inclusiveFiltersEnabled\(\)/);
  assert.match(src("src/components/parent-desk.tsx"), /searchDaycares\(/);
  assert.match(src("src/components/smart-match-chat.tsx"), /searchDaycares\(/);
});
