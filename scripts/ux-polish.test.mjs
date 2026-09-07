import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("empty states share the FeelPhoto-adjacent icon treatment", () => {
  const empty = src("src/components/empty-state.tsx");
  assert.match(empty, /bg-primary\/10/);
  assert.match(empty, /LucideIcon/);
  assert.match(empty, /icon: Icon = Search/);
});

test("listing rails keep 44px chevrons and allow nested hideTitle", () => {
  const rail = src("src/components/listing-rail.tsx");
  assert.match(rail, /hideTitle/);
  assert.match(rail, /className/);
  assert.match(rail, /size-11/);
  assert.match(rail, /railPrev/);
  assert.match(rail, /railNext/);
  assert.doesNotMatch(rail, /className="grid size-8 /);
});

test("parent rails drop stacked headings and show an empty state", () => {
  const rails = src("src/components/parent-desk-rails.tsx");
  assert.match(rails, /EmptyState/);
  assert.match(rails, /hideTitle/);
  assert.match(rails, /min-h-11/);
  assert.match(rails, /emptyFindCare/);
});

test("app home uses one location bar; website does not stack rails and the featured grid", () => {
  const home = src("src/routes/index.tsx");
  const appBlock = home.slice(home.indexOf("ke-app-only"));
  assert.match(appBlock, /featuredSearch/);
  assert.match(appBlock, /CITY_CHIPS/);
  assert.match(appBlock, /applyPlace/);
  assert.doesNotMatch(appBlock, /locationForm/);
  assert.doesNotMatch(appBlock, /useLocation\(\)/);
  assert.match(home, /user && role !== "admin" && role !== "provider"/);
  assert.match(home, /ke-web-grid/);
});

test("listing nearby uses a rail; compare and missing listing use EmptyState copy", () => {
  const listing = src("src/routes/daycare.$slug.tsx");
  assert.match(listing, /ListingRail/);
  assert.match(listing, /listingMissing/);
  assert.match(listing, /listingMissingLead/);
  assert.doesNotMatch(listing, /Listing not available/);

  const compare = src("src/routes/compare.tsx");
  assert.match(compare, /EmptyState/);
  assert.match(compare, /noCompare/);

  const copy = src("src/lib/copy.ts");
  assert.match(copy, /listingMissing: "Listing not available"/);
  assert.match(copy, /listingMissing: "Fiche indisponible"/);
  assert.match(copy, /noCompare: "Nothing to compare yet."/);
  assert.match(copy, /noCompare: "Rien à comparer pour l’instant."/);
});
