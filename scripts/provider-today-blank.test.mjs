import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProviderDeskBatch } from "../src/lib/provider-desk-read.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("provider desk dedupes network reads while applying results to the current mount", () => {
  const provider = read("src/routes/provider.tsx");
  assert.match(provider, /dedupedQuery\(key, QUERY_STALE_MS, fetchProviderDesk, \{ fresh \}\)/);
  assert.match(provider, /readEpoch === deskReadEpoch.current/);
  assert.match(provider, /deskReadEpoch.current \+= 1/);
});

test("a slow or failed side list does not block the core desk", async () => {
  const events = [];
  let finishFeed;
  const delayedFeed = new Promise((resolve) => { finishFeed = resolve; });
  await loadProviderDeskBatch({
    core: async () => "owner",
    feeds: [
      async () => { throw new Error("feed unavailable"); },
      async () => { await delayedFeed; events.push("delayed feed"); },
    ],
    current: () => true,
    applyCore: (value) => events.push(value),
    onCoreFailed: (error) => assert.fail(error),
    onCoreSettled: () => events.push("settled"),
  });
  assert.deepEqual(events, ["owner", "settled"]);
  finishFeed();
  await delayedFeed;
  assert.deepEqual(events, ["owner", "settled", "delayed feed"]);
});

test("retry can apply a good core response, and an obsolete failure is ignored", async () => {
  const events = [];
  let breakFirst;
  let revision = 0;
  const readCore = (run, core) => loadProviderDeskBatch({
    core,
    feeds: [],
    current: () => run === revision,
    applyCore: (value) => events.push(value),
    onCoreFailed: () => events.push("failed"),
    onCoreSettled: () => events.push("settled"),
  });
  await readCore(revision, () => Promise.reject(new Error("first active failure")));
  assert.deepEqual(events, ["failed", "settled"]);
  const obsolete = readCore(revision, () => new Promise((_, reject) => { breakFirst = reject; }));
  await readCore(++revision, async () => "retried");
  breakFirst(new Error("stale retry"));
  await obsolete;
  assert.deepEqual(events, ["failed", "settled", "retried", "settled"]);
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
  // `bump` reloads desks after Mark all read or opening a thread (B03a).
  assert.match(desks, /\[user\?\.id, isPending, pathname, retry, bump\]/);
});

test("Calendar tab stays lit on tours and calendar", () => {
  const bar = read("src/components/app-tab-bar.tsx");
  assert.match(bar, /desk === "calendar" \|\| desk === "tours"/);
});
