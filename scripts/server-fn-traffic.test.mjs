import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { catalogueCacheControl, PUBLIC_CATALOGUE_CACHE_CONTROL } from "./catalogue-cache.mjs";
import {
  CATALOGUE_FN_IDS,
  LISTING_FN_IDS,
  PARENT_DESK_LOOP_FNS,
  productionServerFnId,
} from "./server-fn-ids.mjs";
import { MIN_POLL_MS, dedupedQuery, pollBackoffMs, resetDedupedQueries } from "../src/lib/fn-query.ts";
import {
  SERVER_FN_BURST,
  SERVER_FN_NAME_BURST,
  clientIpFromHeaders,
  consumeServerFnBudget,
  resetServerFnBudget,
} from "../src/lib/server-fn-throttle.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("parent desk loop is the five equal server functions", () => {
  const ids = PARENT_DESK_LOOP_FNS.map(([file, name]) => productionServerFnId(file, name));
  assert.equal(ids.length, 5);
  assert.equal(new Set(ids).size, 5);
  for (const id of ids) assert.match(id, /^[a-f0-9]{64}$/);
  assert.equal(productionServerFnId("src/lib/server/family.ts", "getFamily"), ids[0]);
  assert.equal(CATALOGUE_FN_IDS.get(ids[1]), "searchDaycares");
  assert.equal(LISTING_FN_IDS.size, 2);
});

test("per-IP server function budget sheds a stuck tab and fails open", () => {
  const store = new Map();
  const now = 1_700_000_000_000;
  for (let i = 0; i < SERVER_FN_BURST; i += 1) {
    assert.equal(consumeServerFnBudget("1.2.3.4", "", now, store).ok, true);
  }
  const blocked = consumeServerFnBudget("1.2.3.4", "", now, store);
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.retryAfterSec <= 2, true);

  const later = consumeServerFnBudget("1.2.3.4", "", now + 1000, store);
  assert.equal(later.ok, true);

  const named = new Map();
  for (let i = 0; i < SERVER_FN_NAME_BURST; i += 1) {
    assert.equal(consumeServerFnBudget("9.9.9.9", "getFamily", now, named).ok, true);
  }
  assert.equal(consumeServerFnBudget("9.9.9.9", "getFamily", now, named).ok, false);
  assert.equal(consumeServerFnBudget("9.9.9.9", "searchDaycares", now, named).ok, true);

  assert.equal(consumeServerFnBudget("", "getFamily", now, store).ok, true);
  assert.equal(clientIpFromHeaders(new Headers()), "");
  assert.equal(clientIpFromHeaders(new Headers({ "cf-connecting-ip": "203.0.113.8" })), "203.0.113.8");
  assert.equal(clientIpFromHeaders(new Headers({ "cf-connecting-ip": "203.0.113.8, 10.0.0.1" })), "");
  assert.equal(clientIpFromHeaders(new Headers({ "x-forwarded-for": "203.0.113.8" })), "");
  resetServerFnBudget();
});

test("deduped queries stay stale and polls back off", async () => {
  resetDedupedQueries();
  let calls = 0;
  const first = dedupedQuery("k", 30_000, async () => {
    calls += 1;
    return ["row"];
  });
  const second = dedupedQuery("k", 30_000, async () => {
    calls += 1;
    return ["other"];
  });
  assert.equal(await first, await second);
  assert.deepEqual(await first, ["row"]);
  assert.equal(calls, 1);
  assert.deepEqual(await dedupedQuery("k", 30_000, async () => ["fresh"]), ["row"]);
  assert.equal(calls, 1);
  assert.deepEqual(
    await dedupedQuery("k", 30_000, async () => ["fresh"], { fresh: true }),
    ["fresh"],
  );

  let emptyCalls = 0;
  const empty = () =>
    dedupedQuery(
      "empty",
      30_000,
      async () => {
        emptyCalls += 1;
        return [];
      },
      { cacheIf: (rows) => rows.length > 0 },
    );
  assert.deepEqual(await empty(), []);
  assert.deepEqual(await empty(), []);
  assert.equal(emptyCalls, 2);

  let failures = 0;
  const boom = () =>
    dedupedQuery("boom", 30_000, async () => {
      failures += 1;
      throw new Error("down");
    });
  await assert.rejects(boom, /down/);
  await assert.rejects(boom, /down/);
  assert.equal(failures, 2);

  assert.equal(pollBackoffMs(1), MIN_POLL_MS);
  assert.equal(pollBackoffMs(2), 60_000);
  assert.equal(pollBackoffMs(1, 500), MIN_POLL_MS);
  assert.ok(pollBackoffMs(8) <= 5 * 60_000);
  resetDedupedQueries();
});

test("public catalogue GET JSON can be cached and HTML stays untouched", () => {
  const searchId = productionServerFnId("src/lib/server/daycares.ts", "searchDaycares");
  const listingId = productionServerFnId("src/lib/server/daycares.ts", "getDaycare");
  const hit = {
    pathname: `/_serverFn/${searchId}`,
    method: "GET",
    status: 200,
    cookie: "__Secure-kidease.session_token=abc",
    bodyText: "",
  };
  assert.equal(catalogueCacheControl(hit), PUBLIC_CATALOGUE_CACHE_CONTROL);
  assert.equal(catalogueCacheControl({ ...hit, method: "POST" }), null);
  assert.equal(catalogueCacheControl({ ...hit, status: 500 }), null);
  assert.equal(catalogueCacheControl({ ...hit, pathname: "/" }), null);
  assert.match(PUBLIC_CATALOGUE_CACHE_CONTROL, /s-maxage=120/);
  assert.match(PUBLIC_CATALOGUE_CACHE_CONTROL, /stale-while-revalidate=300/);

  const listing = {
    pathname: `/_serverFn/${listingId}`,
    method: "GET",
    status: 200,
    bodyText: '{"visibility":{"s":"public"},"slug":"bonnie-bairns"}',
  };
  assert.equal(catalogueCacheControl(listing), PUBLIC_CATALOGUE_CACHE_CONTROL);
  assert.equal(
    catalogueCacheControl({ ...listing, cookie: "__Host-grok-auth.session_token=abc" }),
    null,
  );
  assert.equal(
    catalogueCacheControl({ ...listing, bodyText: '{"s":"admin_only"}' }),
    null,
  );
  assert.equal(
    catalogueCacheControl({ ...listing, bodyText: '{"s":"public","slug":"test-ghost"}' }),
    null,
  );
  assert.equal(catalogueCacheControl({ ...listing, setCookie: "a=b" }), null);
});

test("the parent desk effect no longer depends on a fresh user object", () => {
  const desk = src("src/components/parent-desk.tsx");
  assert.match(desk, /\[user\?\.id, loadFamily, loadExplore, loadDeskExtras\]/);
  assert.doesNotMatch(desk, /\[user, loadFamily, loadExplore, loadDeskExtras\]/);
  assert.match(desk, /dedupedQuery/);
  assert.match(desk, /loadFamily\(true\)/);
  const hook = src("src/lib/auth/use-current-user.ts");
  assert.match(hook, /useMemo/);
  assert.match(hook, /if \(mapped\) return \{ user: mapped, isPending: false \}/);
  const daycares = src("src/lib/server/daycares.ts");
  assert.match(daycares, /export const searchDaycares = createServerFn\(\{ method: "GET" \}\)/);
  assert.match(daycares, /export const featuredDaycares = createServerFn\(\{ method: "GET" \}\)/);
  assert.match(daycares, /export const getDaycaresByIds = createServerFn\(\{ method: "GET" \}\)/);
  const thread = src("src/routes/inbox.$id.tsx");
  assert.match(thread, /MIN_POLL_MS/);
  assert.match(thread, /pollBackoffMs/);
  assert.match(thread, /visibilitychange/);
  assert.doesNotMatch(thread, /12_000/);
  const rtc = src("src/lib/multiplayer/p2p.ts");
  assert.match(rtc, /HIDDEN_POLL_MS = 30_000/);
  assert.match(rtc, /visibilitychange/);
  assert.match(rtc, /FAST_POLL_MS = 400/);
  const start = src("src/start.ts");
  assert.match(start, /clientIpFromHeaders/);
  assert.match(start, /\/_serverFn\//);
  assert.match(src("docs/cloudflare.md"), /\/_serverFn\/\*/);
  assert.match(src("docs/cloudflare.md"), /max-age=0/);
});

test("production crons and CI do not hammer server functions", () => {
  const vercel = src("vercel.json");
  assert.match(vercel, /\/api\/digest/);
  assert.match(vercel, /\/api\/search-alerts/);
  assert.doesNotMatch(vercel, /_serverFn/);
  const ci = src(".github/workflows/ci.yml");
  assert.doesNotMatch(ci, /schedule:/);
  assert.match(ci, /pull_request:/);
  const uptime = src("docs/uptime.md");
  assert.match(uptime, /\/api\/health/);
  assert.doesNotMatch(uptime, /_serverFn/);
});
