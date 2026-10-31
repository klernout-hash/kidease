import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { CITY_SEARCH_KEY_EXPR, cityDirectoryMatchSql, citySearchKeyEnabled } from "../src/lib/city-search-key.ts";
import { maybeNotifyOnCall, onCallEnabled } from "../src/lib/on-call.ts";
import { offlineCacheEnabled, offlineSearchRecord, writeOfflineSearch } from "../src/lib/offline-search.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("city search keeps the old expression until the flag is on", () => {
  assert.equal(citySearchKeyEnabled({}), false);
  const neon = readFileSync(join(root, "src/lib/server/catalog-neon.ts"), "utf8");
  assert.match(neon, /DIRECTORY_CITY_KEY_SQL = CITY_SEARCH_KEY_EXPR/);
  assert.match(neon, /cityDirectoryMatchSql\(citySearchKeyEnabled\(\)\)/);
  assert.equal(cityDirectoryMatchSql(false), CITY_SEARCH_KEY_EXPR);
  assert.equal(cityDirectoryMatchSql(true), "city_search_key");
});

test("offline search stores names only on the native app", async () => {
  assert.equal(offlineCacheEnabled({}), false);
  assert.equal(
    offlineSearchRecord({
      enabled: true,
      native: false,
      query: "Montreal",
      rows: [{ id: "1", slug: "a", name: "A", city: "Montreal" }],
    }),
    null,
  );
  const record = offlineSearchRecord({
    enabled: true,
    native: true,
    query: "Montreal",
    rows: [{ id: "1", slug: "a", name: "A", city: "Montreal" }],
    now: new Date("2026-10-31T12:00:00.000Z"),
  });
  assert.equal(record?.rows[0]?.name, "A");
  assert.equal(JSON.stringify(record).includes("photo"), false);
  let saved = "";
  assert.equal(await writeOfflineSearch(record, { set: async (_key, value) => { saved = value; } }), true);
  assert.match(saved, /Montreal/);
});

test("on-call does not call the webhook while the flag is off", async () => {
  assert.equal(onCallEnabled({}), false);
  let called = 0;
  const result = await maybeNotifyOnCall({ ONCALL_WEBHOOK_URL: "https://example.com/hook" }, { ok: false, checkedAt: "2026-10-31T12:00:00.000Z" }, async () => {
    called += 1;
    return new Response("ok");
  });
  assert.equal(result.sent, false);
  assert.equal(called, 0);
});
