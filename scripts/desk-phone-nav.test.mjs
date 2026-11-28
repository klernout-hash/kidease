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
  visibleDeskGroups,
  deskHrefForLocale,
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
  // Phone keeps h-11; desktop items grow with two-line French hints (B03a).
  assert.match(shell, /inline-flex box-border max-md:h-11 min-h-\[44px\] min-w-\[44px\]/);
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
  assert.doesNotMatch(drawer, /plan && "max-md:hidden"/);
  assert.match(shell, /hidden text-\[11px\] font-medium uppercase[\s\S]*md:block/);
  assert.match(shell, /data-ke="desk-desktop-nav"/);
  assert.match(shell, /hidden flex-col gap-\[8px\] md:flex/);
  assert.equal(DESK_NAV.parent.find((item) => item.id === "explore")?.href, "/parent");
});

test("Family desk and Daycare desk titles are keyed for EN and FR", () => {
  const copy = (src("src/lib/copy-en.ts") + src("src/lib/copy-fr.ts"));
  assert.match(copy, /familyDeskTitle: "Family desk"/);
  assert.match(copy, /familyDeskTitle: "Bureau famille"/);
  assert.equal(DESK_META.parent.titleKey, "familyDeskTitle");
  assert.equal(DESK_META.daycare.titleKey, "daycareDeskTitle");
  for (const item of DESK_NAV.parent) {
    assert.ok(item.labelKey, item.id);
  }
});

test("centre nav waits for a confirmed role and the drawer maps staff account links", () => {
  assert.deepEqual(visibleDeskNav("daycare", { centreRolePending: true }), []);
  assert.ok(visibleDeskNav("parent", { centreRolePending: true }).length > 0);
  assert.match(src("src/components/desk-shell.tsx"), /centreRolePending = desk === "daycare" && !session/);
  assert.match(src("src/components/nav-drawer.tsx"), /deskQueryForViewer\("provider", session\?\.centreRole\)/);
});

test("inspection and subsidy appear together only for resolved centre owners", () => {
  const targets = ["inspection-sync", "subsidy"];
  const links = (opts) => visibleDeskNav("daycare", opts).filter((item) => targets.includes(item.id));
  const owner = links({ centreOwner: true, centreRole: "owner" });
  assert.deepEqual(ids(owner), targets);
  assert.deepEqual(visibleDeskGroups("daycare", owner).map(({ group }) => group.id), ["compliance"]);
  assert.deepEqual(owner.map(({ href }) => deskHrefForLocale(href, "/fr/provider")), [
    "/fr/provider/inspection-sync",
    "/fr/provider/subsidy",
  ]);
  for (const opts of [
    undefined,
    { centreRolePending: true, centreOwner: true },
    { centreRole: "staff", centreOwner: true },
    { centreRole: "manager", centreOwner: true },
    { centreOwner: true },
    { centreRole: "read_only", centreOwner: true },
    { centreOwner: false },
    { centreOwner: true, centreLinked: false, centreRole: "owner" },
  ]) assert.deepEqual(links(opts), []);
  for (const desk of ["parent", "admin", "support"]) {
    assert.ok(visibleDeskNav(desk).every((item) => !targets.includes(item.id)));
  }
});

test("both Owner Menu layouts use the guarded compliance group", () => {
  const phone = src("src/components/phone-category-menu.tsx");
  const app = src("src/components/app-menu-screen.tsx");
  assert.match(app, /<OwnerComplianceMenu ownerDesk=\{showCreate\}/);
  assert.match(phone, /<OwnerComplianceMenu ownerDesk=\{host\}/);
  assert.match(phone, /if \(!ownerDesk \|\| !ready \|\| chrome.guestView\) return null/);
  assert.match(phone, /visibleDeskNav\("daycare", \{\s*centreOwner: session\?\.centreOwner/);
});
