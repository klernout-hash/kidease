import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("provider desk dedupes the fetch, not the state update (remount keeps Today filled)", () => {
  const provider = read("src/routes/provider.tsx");
  assert.match(provider, /dedupedQuery\(`provider-desk:\$\{user\.id\}`, QUERY_STALE_MS, fetchProviderDesk\)/);
  assert.doesNotMatch(provider, /dedupedQuery\(`provider-desk:[^`]*`, QUERY_STALE_MS, \(\) => load\(\)/);
  assert.match(provider, /if \(live\) applyProviderDesk\(bundle\)/);
});

test("one failed side list does not empty the whole desk", () => {
  const provider = read("src/routes/provider.tsx");
  assert.match(provider, /listDaycareIncoming\(\)\.catch\(\(\) => \[\] as SpotRequest\[\]\)/);
});

test("Today is never a blank body: loading, failed and no-session states render", () => {
  const provider = read("src/routes/provider.tsx");
  assert.match(provider, /desk === "today" && !deskSettled \? \(/);
  assert.match(provider, /data-ke="provider-today-loading"/);
  assert.match(provider, /data-ke="provider-desk-load-failed"/);
  assert.match(provider, /data-ke="provider-desk-retry"/);
  assert.match(provider, /\(deskListings\.length === 0 && session == null\)/);
});

test("session desks retry after a failed or timed-out getMyDesks", () => {
  const desks = read("src/components/session-desks.tsx");
  assert.match(desks, /const SESSION_DESK_RETRIES = 2;/);
  assert.match(desks, /setRetry\(\(n\) => n \+ 1\)/);
  assert.match(desks, /\[user\?\.id, isPending, pathname, retry\]/);
});

test("Calendar tab stays lit on tours and calendar", () => {
  const bar = read("src/components/app-tab-bar.tsx");
  assert.match(bar, /desk === "calendar" \|\| desk === "tours"/);
});
