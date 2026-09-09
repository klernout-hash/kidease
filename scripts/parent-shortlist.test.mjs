import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const MAX_SHORTLIST_COMPARE = 5;

function isValidDaycareId(raw) {
  if (typeof raw !== "string") return false;
  const id = raw.trim();
  return id.length >= 2 && id.length <= 80 && /^[a-zA-Z0-9_-]+$/.test(id);
}

function toggleCompareSelection(selected, id, max = MAX_SHORTLIST_COMPARE) {
  if (selected.includes(id)) return selected.filter((x) => x !== id);
  if (selected.length >= max) return selected;
  return [...selected, id];
}

test("shortlist compare is capped at five centres", () => {
  const lib = src("src/lib/shortlist.ts");
  assert.match(lib, /export const MAX_SHORTLIST_COMPARE = 5/);
  assert.deepEqual(toggleCompareSelection(["a", "b"], "c"), ["a", "b", "c"]);
  assert.deepEqual(toggleCompareSelection(["a", "b", "c", "d", "e"], "f"), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(toggleCompareSelection(["a", "b", "c"], "b"), ["a", "c"]);
});

test("guest pending-save ids are validated", () => {
  const lib = src("src/lib/shortlist.ts");
  assert.match(lib, /PENDING_SAVE_KEY/);
  assert.match(lib, /stashPendingSave/);
  assert.match(lib, /takePendingSave/);
  assert.match(lib, /isValidDaycareId/);
  assert.equal(isValidDaycareId("dc_winnipeg_1"), true);
  assert.equal(isValidDaycareId("dc-1"), true);
  assert.equal(isValidDaycareId(""), false);
  assert.equal(isValidDaycareId("not a id"), false);
  assert.equal(isValidDaycareId("<script>"), false);
});

test("compare field helpers live next to ages, hours, language, culture, spots", () => {
  const lib = src("src/lib/shortlist.ts");
  assert.match(lib, /export function formatListingAges/);
  assert.match(lib, /export function formatListingLanguages/);
  assert.match(lib, /export function formatListingCulture/);
  assert.match(lib, /CULTURE_AMENITIES/);
  assert.match(lib, /montessori/);
  assert.match(lib, /inclusive/);
  assert.match(lib, /export function listingSpotsTotal/);
  assert.match(lib, /export function listingIsVerified/);
  assert.match(lib, /formatAgeRange/);
});

test("Neon persists shortlist per parent user", () => {
  const schema = src("migrations/0002_schema.sql");
  const family = src("src/lib/server/family.ts");
  assert.match(schema, /create table if not exists saved_daycares/);
  assert.match(schema, /primary key \(user_id, daycare_id\)/);
  assert.match(family, /export const toggleSave/);
  assert.match(family, /export const saveDaycare/);
  assert.match(family, /export const unsaveDaycare/);
  assert.match(family, /export const listSavedIds/);
  assert.match(family, /insert into saved_daycares/);
  assert.match(family, /on conflict \(user_id, daycare_id\) do nothing/);
  assert.match(family, /delete from saved_daycares where user_id = \$\{context\.userId\} and daycare_id/);
});

test("listing detail and cards save or remove, guests keep intent", () => {
  const card = src("src/components/daycare-card.tsx");
  const listing = src("src/routes/daycare.$slug.tsx");
  const button = src("src/components/save-listing-button.tsx");
  const apply = src("src/components/apply-pending-shortlist.tsx");
  const shell = src("src/components/shell.tsx");
  const pending = src("src/lib/shortlist.ts");
  assert.match(card, /SaveListingButton/);
  assert.match(listing, /SaveListingButton/);
  assert.match(listing, /appearance="ghost"/);
  assert.match(listing, /appearance="bar"/);
  assert.match(button, /stashPendingSave/);
  assert.match(button, /parentLoginSearch/);
  assert.match(button, /saveDaycare/);
  assert.match(button, /unsaveDaycare/);
  assert.match(apply, /takePendingSave/);
  assert.match(apply, /saveDaycare/);
  assert.match(shell, /ApplyPendingShortlist/);
  assert.match(pending, /PENDING_SAVE_KEY/);
});

test("parent desk shortlist compares up to five centres", () => {
  const desk = src("src/components/parent-desk.tsx");
  const shortlist = src("src/components/parent-shortlist.tsx");
  const table = src("src/components/shortlist-compare.tsx");
  const compare = src("src/routes/compare.tsx");
  const nav = src("src/lib/desk-nav.ts");
  const copy = src("src/lib/copy.ts");
  const localCompare = src("src/lib/compare.ts");
  assert.match(desk, /ParentShortlist/);
  assert.match(shortlist, /MAX_SHORTLIST_COMPARE/);
  assert.match(shortlist, /addToCompare/);
  assert.match(shortlist, /myShortlist/);
  assert.match(table, /compareVerified/);
  assert.match(table, /formatListingAges/);
  assert.match(table, /compareDistance/);
  assert.match(table, /formatListingLanguages/);
  assert.match(table, /compareCulture/);
  assert.match(table, /compareSpots/);
  assert.match(compare, /formatListingAges/);
  assert.match(compare, /compareDistance/);
  assert.match(nav, /My shortlist/);
  assert.match(copy, /myShortlist: "My shortlist"/);
  assert.match(copy, /myShortlist: "Ma liste"/);
  assert.match(copy, /Select up to 5 centres/);
  assert.match(localCompare, /const MAX = 5/);
  assert.doesNotMatch(desk, /GHL|ghl/);
  assert.doesNotMatch(shortlist, /DeskSwitcher/);
});
