import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { filterByDaycareName } from "../src/lib/explore-search.ts";
import { directionsUrl } from "../src/lib/maps.ts";
import { visibleDeskGroups, visibleDeskNav } from "../src/lib/desk-nav.ts";
import { listingActionMode, showsParentBrowseActions, showsParentListingActions } from "../src/lib/role-access.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("a name search keeps matches outside the current radius", () => {
  const rows = [
    { name: "Neighbourhood Care", nameFr: "", city: "Winnipeg" },
    { name: "Little Fox Child Care Centre", nameFr: "Petit Renard", city: "Toronto" },
  ];
  const matches = filterByDaycareName(rows, "Little Fox");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].name, "Little Fox Child Care Centre");
  assert.equal(filterByDaycareName(rows, "  ").length, rows.length);
});

test("the search page asks the server for the name and counts the cards it shows", () => {
  const search = src("src/routes/search.tsx");
  assert.match(search, /name: nameQuery\.trim\(\) \|\| undefined/);
  const server = src("src/lib/server/daycares.ts");
  assert.match(server, /if \(\(data\.name \|\| ""\)\.trim\(\)\.length >= 2\) return searchByName/);
  assert.match(server, /filterByDaycareName/);
  assert.match(search, /nameSearch \|\| extraFilters \? visualItems\.length : resultTotal/);
  assert.match(search, /: nameQuery\.trim\(\)/);
  assert.doesNotMatch(search, /if \(workOrigin\?\.label && !workQuery\) setWorkQuery/);
  assert.match(search, /const workForSearch = workQuery\.trim\(\) && workOrigin \? workOrigin : null/);
});

test("Find my match stays in the hero, search, and menu", () => {
  const entry = src("src/components/smart-match.tsx");
  assert.match(entry, /useAiFeatureFlag\(AI_FLAGS\.smartMatch\)/);
  assert.doesNotMatch(entry, /if \(!on\) return null/);
  assert.match(src("src/routes/index.tsx"), /<SmartMatchEntry inline quiet/);
  assert.match(src("src/routes/search.tsx"), /<SmartMatchEntry/);
  const drawer = src("src/components/nav-drawer.tsx");
  assert.equal((drawer.match(/<SmartMatchEntry inline/g) || []).length, 2);
});

test("parent and daycare menus keep the plan item and a visible group label", () => {
  assert.equal(visibleDeskNav("parent", { subscriptionsEnabled: false }).some((item) => item.id === "upgrade"), true);
  assert.equal(
    visibleDeskNav("daycare", { centreOwner: false, centreLinked: false }).some((item) => item.id === "subscription"),
    true,
  );
  const parent = visibleDeskGroups("parent", visibleDeskNav("parent", { subscriptionsEnabled: false }));
  for (const id of ["search-tools", "account", "settings"]) {
    const group = parent.find((row) => row.group.id === id);
    assert.ok(group, id);
    assert.equal(group.group.open, true);
    assert.ok(group.items.length > 0, id);
  }
  assert.ok(parent.find((row) => row.group.id === "account")?.items.some((item) => item.id === "upgrade"));
  const shell = src("src/components/desk-shell.tsx");
  const drawer = src("src/components/nav-drawer.tsx");
  assert.match(shell, /<span>\{group\.labelKey \? t\(group\.labelKey\) : group\.label\}<\/span>/);
  assert.match(drawer, /<span>\{group\.labelKey \? t\(group\.labelKey\) : group\.label\}<\/span>/);
  assert.doesNotMatch(drawer, /plan && "max-md:hidden"/);
});

test("daycare accounts do not get parent actions, and owners still get edit", () => {
  assert.equal(listingActionMode({ role: "provider", ownsListing: false }), "none");
  assert.equal(listingActionMode({ role: "provider", ownsListing: true }), "edit");
  assert.equal(showsParentListingActions(listingActionMode({ role: "provider", ownsListing: false })), false);
  assert.equal(showsParentBrowseActions("provider"), false);
  assert.equal(showsParentBrowseActions("parent"), true);
  assert.equal(showsParentBrowseActions("guest"), true);
  const listing = src("src/routes/daycare.$slug.tsx");
  assert.match(listing, /data-ke="hidden-from-public"/);
  assert.match(listing, /data-ke="get-directions"/);
  assert.match(listing, /t\("getDirections"\)/);
  assert.match(listing, /t\("deskHomeEdit"\)/);
  assert.match(listing, /\{parentActions \? <JoinWaitlist/);
  assert.match(src("src/components/daycare-card.tsx"), /showsParentBrowseActions/);
  assert.match(src("src/lib/server/daycares.ts"), /callerMayViewHiddenListing/);
});

test("Get directions uses the street, then coordinates", () => {
  const street = directionsUrl(49.2, -123.1, "Little Fox", {
    apple: false,
    address: "12 Oak Street",
    city: "Vancouver",
    province: "BC",
    postalCode: "V6B 1A1",
  });
  assert.match(street, /^https:\/\/www\.google\.com\/maps\/dir\/\?/);
  assert.match(street, /12\+Oak\+Street/);
  assert.match(street, /Vancouver/);
  const pin = directionsUrl(51.25, -100.5, "", { apple: false });
  assert.match(pin, /51\.25(?:%2C|,)-100\.5/);
});
