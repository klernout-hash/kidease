import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { DESK_NAV, DESK_META } from "../src/lib/desk-nav.ts";
import {
  canSeeAdminDesk,
  desksFor,
  headerDesks,
  showDeskSwitcher,
} from "../src/lib/desks.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("empty Messages CTA stays on centre inbox, not Today", () => {
  const desk = src("src/components/centre-inbox.tsx");
  const list = src("src/components/inbox-list.tsx");
  assert.match(desk, /data-ke="inbox-empty-cta"/);
  const emptyCta = desk.slice(desk.indexOf("inboxEmptyNeedYouCta") - 220, desk.indexOf("inboxEmptyNeedYouCta") + 80);
  assert.match(emptyCta, /to="\/inbox"/);
  assert.match(emptyCta, /inboxSearch\("centre"\)/);
  assert.doesNotMatch(emptyCta, /desk:\s*"today"/);
  assert.doesNotMatch(emptyCta, /to="\/provider"/);
  assert.match(list, /actionTo="\/inbox\?view=centre"/);
  assert.doesNotMatch(list, /actionTo="\/provider"/);
});

test("inbox stage filters wrap so full labels stay visible", () => {
  const desk = src("src/components/centre-inbox.tsx");
  assert.match(desk, /data-ke="inbox-stage-filters"/);
  assert.match(desk, /flex flex-wrap gap-1\.5/);
  assert.match(desk, /whitespace-nowrap/);
  const start = desk.indexOf('data-ke="inbox-stage-filters"');
  const filters = desk.slice(start, desk.indexOf("</div>", start));
  assert.doesNotMatch(filters, /overflow-x-auto/);
});

test("header pills follow stored roles; Admin only for kyle", () => {
  assert.deepEqual(headerDesks(desksFor({ role: "provider" }), "provider"), ["provider"]);
  assert.equal(showDeskSwitcher(desksFor({ role: "provider" }), "provider"), false);
  assert.deepEqual(headerDesks(desksFor({ role: "parent" }), "parent"), ["parent"]);
  assert.deepEqual(headerDesks(desksFor({ role: "parent", ownsCentre: true }), "parent"), [
    "provider",
    "parent",
  ]);
  assert.deepEqual(headerDesks(desksFor({ role: "admin" }), "admin", "kyle@kidease.ca"), [
    "admin",
    "parent",
    "provider",
  ]);
  assert.equal(headerDesks(desksFor({ role: "admin" }), "admin", "parent@example.com").includes("admin"), false);
  assert.equal(canSeeAdminDesk("provider", "kyle@kidease.ca"), false);
  assert.equal(canSeeAdminDesk("parent", "parent@example.com"), false);
  assert.equal(canSeeAdminDesk("admin", "kyle@kidease.ca"), true);
});

test("Daycare desk chrome is keyed for EN and FR", () => {
  const copy = src("src/lib/copy.ts");
  assert.match(copy, /todayHome: "Today"/);
  assert.match(copy, /todayHome: "Aujourd’hui"/);
  assert.match(copy, /deskNavListings: "My listings"/);
  assert.match(copy, /deskNavListings: "Mes fiches"/);
  assert.match(copy, /daycareDeskTitle: "Daycare desk"/);
  assert.match(copy, /daycareDeskTitle: "Bureau garderie"/);
  assert.match(copy, /inboxEmptyNeedYouCta: "See incoming requests"/);
  assert.match(copy, /inboxEmptyNeedYouCta: "Voir les demandes entrantes"/);
  assert.match(copy, /inboxStageNewInquiry: "New inquiry"/);
  assert.match(copy, /inboxStageNewInquiry: "Nouvelle demande"/);
  assert.match(copy, /inboxSoftHold: "Soft-hold"/);
  assert.match(copy, /todayActionRequired: "Action required"/);
  assert.match(copy, /todayActionRequired: "Action requise"/);
  for (const item of DESK_NAV.daycare) {
    assert.ok(item.labelKey, item.id);
  }
  assert.equal(DESK_META.daycare.titleKey, "daycareDeskTitle");
  const shell = src("src/components/desk-shell.tsx");
  assert.match(shell, /useCopy/);
  assert.match(shell, /item\.labelKey/);
  assert.match(shell, /deskNavMore/);
});
