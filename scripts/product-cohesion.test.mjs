import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { decisionCopy } from "../src/lib/admin-decision-copy.ts";
import { DESK_NAV } from "../src/lib/desk-nav.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function packKeys(src, pack) {
  const start = src.indexOf(`  ${pack}: {`);
  assert.ok(start >= 0, `missing ${pack} pack`);
  const rest = src.slice(start);
  const end = pack === "en" ? rest.indexOf("\n  fr: {") : rest.lastIndexOf("\n  },");
  const block = end === -1 ? rest : rest.slice(0, end);
  return [...block.matchAll(/^\s{4}([A-Za-z][A-Za-z0-9]*):/gm)].map((m) => m[1]);
}

test("displayCentreName is used on listing and map, not only cards", () => {
  const utils = readFileSync(join(root, "src/lib/utils.ts"), "utf8");
  assert.match(utils, /\\bCetnre\\b/);
  const listing = readFileSync(join(root, "src/routes/daycare.$slug.tsx"), "utf8");
  const map = readFileSync(join(root, "src/components/map-view.tsx"), "utf8");
  assert.match(listing, /displayCentreName/);
  assert.match(map, /displayCentreName/);
});

test("EN and FR copy packs share the same keys", () => {
  const src = readFileSync(join(root, "src/lib/copy.ts"), "utf8");
  const en = packKeys(src, "en");
  const fr = packKeys(src, "fr");
  assert.deepEqual(fr, en);
});

test("public copy no longer says preview / next-month fiction", () => {
  const src = readFileSync(join(root, "src/lib/copy.ts"), "utf8");
  assert.match(src, /claimCodeHint: "Enter the code we sent/);
  assert.doesNotMatch(src, /In this preview the code is shown here/);
  assert.doesNotMatch(src, /availableNextMonth: "Daycares available next month"/);
  assert.match(src, /trustGoogle: "Search near you"/);
  assert.match(src, /noSavedLead: "Save a listing from search/);
});

test("parent desk starts with Home; provider Add is not a dead tab id", () => {
  assert.equal(DESK_NAV.parent[0].id, "home");
  assert.equal(DESK_NAV.daycare.some((item) => item.id === "add" && !item.href), true);
});

test("admin request-info email includes the operator note", () => {
  const info = decisionCopy("info", "Prairie Kids", "Please send the 2026 licence.");
  assert.match(info.subject, /Prairie Kids/);
  assert.match(info.text, /2026 licence/);
  const waiting = decisionCopy("waiting", "Prairie Kids", "Licence photo is blurry.");
  assert.match(waiting.text, /Licence photo is blurry/);
});

test("guest FAQ and verify listings stay on public sitemap", () => {
  const sitemap = readFileSync(join(root, "public/sitemap.xml"), "utf8");
  assert.match(sitemap, /https:\/\/www\.kidease\.ca\/faq/);
  assert.doesNotMatch(sitemap, /\/admin/);
});
