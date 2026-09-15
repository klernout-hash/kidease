import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  canNavigateBackInApp,
  isMenuLeafPath,
  MENU_LEAF_PATHS,
  MENU_ROUTE,
} from "../src/lib/menu-leaf.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const TAB_OR_STACK = [
  "/",
  "/search",
  "/fr/search",
  "/explore",
  "/menu",
  "/parent",
  "/parent?tab=saved",
  "/inbox",
  "/login",
  "/fr/login",
  "/account",
  "/provider",
  "/compare",
  "/admin",
  "/daycare/demo-centre",
  "/listing/demo-centre",
];

test("menu-leaf paths cover hamburger marketing/info links and skip tab stacks", () => {
  for (const path of MENU_LEAF_PATHS) {
    assert.equal(isMenuLeafPath(path), true, path);
    if (path !== "/") assert.equal(isMenuLeafPath(`/fr${path}`), true, `/fr${path}`);
  }
  assert.equal(isMenuLeafPath("/get-app"), true);
  assert.equal(isMenuLeafPath("/fr/get-app"), true);
  assert.equal(isMenuLeafPath("/get-app?dev=1"), true);
  for (const path of TAB_OR_STACK) {
    assert.equal(isMenuLeafPath(path.split("?")[0]), false, path);
  }
  assert.equal(MENU_ROUTE, "/menu");
});

test("menu page destinations are classified as leaf, excluded, or redirect", () => {
  const menu = src("src/routes/menu.tsx");
  const tos = [...menu.matchAll(/\bto="(\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(tos.includes("/get-app"));
  const excluded = new Set([
    "/search",
    "/login",
    "/parent",
    "/account",
    "/compare",
    "/provider",
    "/how-it-works",
  ]);
  const unknown = [];
  for (const to of tos) {
    if (excluded.has(to) || isMenuLeafPath(to)) continue;
    unknown.push(to);
  }
  assert.deepEqual(unknown, [], `uncategorized Menu links: ${unknown.join(", ")}`);
});

test("in-app back is true only for SPA history or same-origin referrer", () => {
  const origin = "https://www.kidease.ca";
  assert.equal(
    canNavigateBackInApp({
      history: { length: 4, state: { __TSR_index: 1 } },
      location: { origin, pathname: "/get-app" },
      document: { referrer: "" },
    }),
    true,
  );
  assert.equal(
    canNavigateBackInApp({
      history: { length: 8, state: { __TSR_index: 0 } },
      location: { origin, pathname: "/get-app" },
      document: { referrer: "https://www.google.com/" },
    }),
    false,
  );
  assert.equal(
    canNavigateBackInApp({
      history: { length: 2, state: { __TSR_index: 0 } },
      location: { origin, pathname: "/get-app" },
      document: { referrer: `${origin}/menu` },
    }),
    true,
  );
  assert.equal(
    canNavigateBackInApp({
      history: { length: 1, state: { __TSR_index: 0 } },
      location: { origin, pathname: "/get-app" },
      document: { referrer: "" },
    }),
    false,
  );
  assert.equal(
    canNavigateBackInApp({
      history: { length: 2, state: { idx: 2 } },
      location: { origin, pathname: "/fr/get-app" },
      document: { referrer: "" },
    }),
    true,
  );
});

test("Shell wires MenuLeafBack on leaf routes only; listing/auth keep their own chrome", () => {
  const shell = src("src/components/shell.tsx");
  const back = src("src/components/menu-leaf-back.tsx");
  const copy = src("src/lib/copy.ts");
  assert.match(shell, /MenuLeafBack/);
  assert.match(shell, /isMenuLeafPath\(pathname\)/);
  assert.match(back, /data-ke-menu-leaf-back/);
  assert.match(back, /router\.history\.back\(\)/);
  assert.match(back, /MENU_ROUTE/);
  assert.match(back, /t\("backToMenu"\)/);
  assert.match(copy, /backToMenu: "Back to menu"/);
  assert.match(copy, /backToMenu: "Retour au menu"/);
  assert.doesNotMatch(src("src/routes/index.tsx"), /MenuLeafBack/);
  assert.doesNotMatch(src("src/routes/search.tsx"), /MenuLeafBack/);
  assert.doesNotMatch(src("src/routes/menu.tsx"), /MenuLeafBack/);
  assert.doesNotMatch(src("src/routes/compare.tsx"), /MenuLeafBack/);
  assert.doesNotMatch(src("src/routes/login.tsx"), /MenuLeafBack/);
  assert.doesNotMatch(src("src/routes/daycare.$slug.tsx"), /MenuLeafBack/);
  assert.match(src("src/routes/daycare.$slug.tsx"), /backToExplore/);
});
