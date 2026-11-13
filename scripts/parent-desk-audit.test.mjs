import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function src(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("learning stories and child health stay inside the parent desk", () => {
  const page = src("src/routes/parent.tsx");
  const desk = src("src/components/parent-desk.tsx");
  const nav = src("src/lib/desk-nav.ts");
  assert.doesNotMatch(page, /StoriesDeskLink/);
  assert.doesNotMatch(page, /ChildHealthLog/);
  assert.match(desk, /<ChildHealthLog \/>/);
  assert.match(nav, /id: "stories"/);
  assert.match(nav, /parentStoriesNav/);
  assert.match(page, /ParentMenuFrame/);
  assert.match(page, /search.tab === "documents"/);
  assert.match(page, /search.tab === "stories"/);
});

test("phone menu can open pay, documents, tours, family, daycare notes, and alerts", () => {
  const phone = src("src/components/phone-category-menu.tsx");
  const classic = src("src/components/app-menu-screen.tsx");
  for (const marker of ["payments", "documents", "tour-calendar", "family", "centre-tools", "alerts", "stories"]) {
    assert.match(phone, new RegExp(`marker: "${marker}"`));
    assert.match(classic, new RegExp(`marker="${marker}"`));
  }
  assert.match(phone, /My family/);
  assert.doesNotMatch(phone, /NotificationBell/);
});

test("home puts saved daycares and waiting items before search", () => {
  const home = src("src/components/parent-home.tsx");
  const saved = home.indexOf('data-ke="parent-home-saved"');
  const waiting = home.indexOf('data-ke="parent-home-waiting"');
  const search = home.indexOf('data-ke="parent-home-search"');
  assert.ok(saved > 0 && waiting > saved && search > waiting);
});

test("listing phone bar keeps one primary, Save, and a secondary disclosure", () => {
  const page = src("src/routes/daycare.$slug.tsx");
  const start = page.indexOf('data-ke="listing-sticky-bar"');
  const bar = page.slice(start, start + 1600);
  assert.match(bar, /data-ke="listing-sticky-cta"/);
  assert.match(bar, /SaveListingButton/);
  assert.match(bar, /ListingMoreActions compact/);
  assert.doesNotMatch(bar, /ListingCtaSnippet/);
  assert.match(src("src/components/listing-parent-pack.tsx"), /data-ke="listing-availability"/);
});
