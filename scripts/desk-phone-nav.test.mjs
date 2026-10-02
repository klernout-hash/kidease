import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DAYCARE_PRIMARY_NAV_IDS,
  DESK_META,
  DESK_NAV,
  PARENT_PRIMARY_NAV_IDS,
  visibleDeskNav,
  visiblePrimaryDeskNav,
  visibleSecondaryDeskNav,
} from "../src/lib/desk-nav.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const ownerOpts = { providerSubscriptions: true, showPayCtas: true, centreOwner: true };

function ids(items) {
  return items.map((item) => item.id);
}

test("phone primaries plus More still reach every Parent and Daycare destination", () => {
  for (const desk of ["parent", "daycare"]) {
    const all = new Set(ids(visibleDeskNav(desk, ownerOpts)));
    const covered = new Set([
      ...ids(visiblePrimaryDeskNav(desk, ownerOpts)),
      ...ids(visibleSecondaryDeskNav(desk, ownerOpts)),
    ]);
    assert.deepEqual([...covered].sort(), [...all].sort(), desk);
  }
  assert.deepEqual(ids(visiblePrimaryDeskNav("parent")), [...PARENT_PRIMARY_NAV_IDS]);
  assert.deepEqual(ids(visiblePrimaryDeskNav("daycare", ownerOpts)), [...DAYCARE_PRIMARY_NAV_IDS]);
});

test("Parent primaries include Search and Messages; Daycare Messages stays a desk primary", () => {
  const parentPrimary = new Set(ids(visiblePrimaryDeskNav("parent")));
  const parentSheet = new Set(ids(visibleSecondaryDeskNav("parent")));
  assert.equal(parentPrimary.has("messages"), true);
  assert.equal(parentPrimary.has("search"), true);
  assert.equal(parentSheet.has("messages"), false);
  assert.equal(parentSheet.has("search"), false);
  assert.equal(DESK_NAV.parent.find((i) => i.id === "messages")?.href, "/inbox");
  assert.equal(DESK_NAV.parent.find((i) => i.id === "search")?.href, "/search");

  const daycarePrimary = new Set(ids(visiblePrimaryDeskNav("daycare", ownerOpts)));
  const daycareSheet = new Set(ids(visibleSecondaryDeskNav("daycare", ownerOpts)));
  assert.equal(daycarePrimary.has("messages"), true);
  assert.equal(daycareSheet.has("messages"), false);
  assert.equal(DESK_NAV.daycare.find((i) => i.id === "messages")?.href, "/inbox");
});

test("phone primary pills share the same chrome for buttons and Messages links", () => {
  const shell = src("src/components/desk-shell.tsx");
  assert.match(shell, /function navClass/);
  assert.match(shell, /inline-flex box-border h-11 min-h-11/);
  assert.match(shell, /no-underline/);
  const link = shell.slice(shell.indexOf("function DeskNavLink"), shell.indexOf("function itemIsOn"));
  const button = shell.slice(shell.indexOf("function DeskNavButton"), shell.indexOf("function DeskNavLink"));
  assert.match(link, /data-ke="desk-primary-pill"/);
  assert.match(button, /data-ke="desk-primary-pill"/);
  assert.match(link, /navClass\(on\)/);
  assert.match(button, /navClass\(on\)/);
  assert.match(link, /<Link/);
  assert.match(button, /<button/);
});

test("phone desk destinations live in one hamburger, and the desktop sidebar stays", () => {
  const shell = src("src/components/desk-shell.tsx");
  const drawer = src("src/components/nav-drawer.tsx");
  assert.doesNotMatch(shell, /data-ke="desk-more-sheet"/);
  assert.doesNotMatch(shell, /data-ke="desk-more-open"/);
  assert.doesNotMatch(shell, /data-ke="desk-tab-nav"/);
  assert.match(shell, /DeskMenuProvider/);
  assert.match(drawer, /useDeskMenu/);
  assert.match(drawer, /max-md:hidden/);
  assert.match(shell, /hidden text-\[11px\] font-medium uppercase[\s\S]*md:block/);
  assert.match(shell, /data-ke="desk-desktop-nav"/);
  assert.match(shell, /hidden flex-col gap-0\.5 md:flex/);
  assert.equal(DESK_NAV.parent.find((item) => item.id === "explore")?.href, "/parent");
});

test("Family desk and Daycare desk titles are keyed for EN and FR", () => {
  const copy = src("src/lib/copy.ts");
  assert.match(copy, /familyDeskTitle: "Family desk"/);
  assert.match(copy, /familyDeskTitle: "Bureau famille"/);
  assert.equal(DESK_META.parent.titleKey, "familyDeskTitle");
  assert.equal(DESK_META.daycare.titleKey, "daycareDeskTitle");
  for (const item of DESK_NAV.parent) {
    assert.ok(item.labelKey, item.id);
  }
});
