import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { LOADER_WATCHDOG_MS, settleLoader } from "../src/lib/loader-settle.ts";

const src = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the loader watchdog is 10 seconds", () => {
  assert.equal(LOADER_WATCHDOG_MS, 10_000);
});

test("a rejected fetch settles to an error, not a placeholder", async () => {
  const outcome = await settleLoader(Promise.reject(new Error("boom")), 50);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, "error");
  assert.equal(outcome.error.message, "boom");
});

test("a fetch that never settles times out", async () => {
  const outcome = await settleLoader(new Promise(() => {}), 20);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, "timeout");
});

test("a fetch that resolves keeps its value, even an empty list", async () => {
  assert.deepEqual(await settleLoader(Promise.resolve([]), 50), { ok: true, value: [] });
});

test("search: a hung or failed page fetch becomes the error state with Try again", () => {
  const search = src("src/routes/search.tsx");
  assert.match(search, /window\.setTimeout\(\(\) => fail\(\), LOADER_WATCHDOG_MS\)/);
  // fail never leaves items null, and it captures the surface.
  assert.match(search, /const fail = \(error\?: unknown\) => \{[\s\S]*?captureLoaderFailure\("search"[\s\S]*?setItems\(\(rows\) => rows \?\? \[\]\);[\s\S]*?setSearchFailed\(true\);[\s\S]*?setRefreshing\(false\);/);
  assert.match(search, /\.catch\(fail\)/);
  assert.match(search, /title: t\("searchFailedTitle"\),[\s\S]*?action: t\("tryAgain"\),\s*onAction: retrySearch/);
});

test("parent explore, children and extras settle within the watchdog", () => {
  const desk = src("src/components/parent-desk.tsx");
  assert.match(desk, /useLoaderWatchdog\(signedIn && !exploreReady, "parent-explore"[\s\S]*?setExploreError\(true\);\s*setExploreReady\(true\);/);
  assert.match(desk, /useLoaderWatchdog\(signedIn && !childrenReady, "parent-children"[\s\S]*?setHomeError\(true\);\s*setChildrenReady\(true\);/);
  assert.match(desk, /useLoaderWatchdog\(signedIn && extrasState === "pending", "parent-extras", \(\) => setExtrasState\("error"\)\)/);
  // A failed family load ends every placeholder, not only explore and children.
  assert.match(desk, /captureLoaderFailure\("parent-children", error\);[\s\S]*?setExploreReady\(true\);\s*setChildrenReady\(true\);\s*setHomeError\(true\);\s*setExtrasState\("error"\);/);
  // Children tab: an error with Try again, not an empty "no children" state.
  assert.match(desk, /homeError && children\.length === 0 && !editing \? \(\s*<div role="alert" data-ke="parent-children-error">[\s\S]*?onClick=\{retryHome\}/);
});

test("a shortlist refresh cannot supersede the home load and strand explore", () => {
  const desk = src("src/components/parent-desk.tsx");
  assert.match(desk, /function refresh\(\) \{\s*if \(familyInFlight\.current\) \{\s*refreshQueued\.current = true;\s*return;/);
  assert.match(desk, /familyInFlight\.current = true;\s*return loadFamily\(true\);\s*\}\)\s*\.then\(\(f\) => \{\s*familyInFlight\.current = false;/);
  assert.match(desk, /\.catch\(\(error: unknown\) => \{\s*familyInFlight\.current = false;/);
  assert.match(desk, /flushQueuedRefresh\(\)/);
});

test("the watchdog hook captures $exception with the surface", () => {
  const hook = src("src/lib/use-loader-watchdog.ts");
  assert.match(hook, /captureLoaderFailure\(surface, new Error\(`\$\{surface\}-timeout`\), "timeout"\)/);
  const lib = src("src/lib/loader-settle.ts");
  assert.match(lib, /capturePostHogEvent\("\$exception", \{[\s\S]*?\$exception_source: surface,\s*surface,/);
});
