import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const page = src("src/routes/daycare.$slug.tsx");
const css = src("src/styles.css");

test("P3-4: the hidden-from-public notice sits below the title row, full width", () => {
  const header = page.slice(page.indexOf('data-ke="listing-name"') - 200, page.indexOf('data-ke="listing-place-type"'));
  const notice = header.indexOf('data-ke="hidden-from-public"');
  assert.ok(notice > 0, "notice is in the listing header");
  // The title row closes before the notice opens: the notice is not a flex sibling of the title.
  const share = header.indexOf("<ShareListingButton");
  assert.ok(share > 0 && share < notice, "notice comes after the title row (and its share button)");
  const between = header.slice(share, notice);
  assert.match(between, /<\/div>/, "title row is closed before the notice");
  assert.match(header.slice(notice - 200, notice), /w-full/);
  // Badges next to the title wrap instead of squeezing it.
  assert.match(header, /data-ke="listing-name">\s*<div className="flex flex-wrap items-start/);
});

test("P3-16: the listing goes two-column only from 1024px; portrait tablets get one column", () => {
  const grid = css.slice(css.indexOf(".ke-listing-page {\n    display: grid;") - 80, css.indexOf(".ke-listing-page {\n    display: grid;"));
  assert.match(grid, /@media \(min-width: 1024px\)/);
  assert.doesNotMatch(css, /@media \(min-width: 768px\) \{\s*\.ke-listing-page \{\s*display: grid;/);
  // Side cards and the phone action bar switch at the same breakpoint.
  const asides = page.match(/<aside className="ke-listing-summary[^"]*"/g) ?? [];
  assert.equal(asides.length, 2);
  for (const aside of asides) {
    assert.match(aside, /hidden/);
    assert.match(aside, /lg:block/);
    assert.doesNotMatch(aside, /md:block/);
  }
  const bar = page.slice(page.lastIndexOf("<div", page.indexOf('data-ke="listing-sticky-bar"')), page.indexOf('data-ke="listing-sticky-bar"'));
  assert.match(bar, /lg:hidden/);
  assert.doesNotMatch(bar, /md:hidden/);
  assert.match(page, /data-ke="listing-next-step-lead"/);
  assert.match(page, /text-muted lg:hidden" data-ke="listing-next-step-lead"/);
  assert.match(page, /<div className="mt-4 lg:hidden">\s*<EarlyListingActions/);
});

test("P3-16: on portrait tablets the sticky bar reserves room and does not cover content", () => {
  const at = css.indexOf("@media (min-width: 768px) and (max-width: 1023px) {\n  html:has([data-ke=\"listing-sticky-bar\"]) .ke-listing-page");
  assert.ok(at > 0, "tablet sticky-bar block exists");
  const block = css.slice(at, css.indexOf("\n}\n", at));
  assert.match(block, /\.ke-listing-page \{\s*padding-bottom: calc\(7rem \+ env\(safe-area-inset-bottom, 0px\)\);/);
  assert.match(block, /scroll-padding-bottom/);
  assert.match(block, /\.ke-help-bot \{\s*bottom:/);
});
