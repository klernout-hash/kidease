import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  BACKFILL_USERS_SQL,
  describeBackfillEvent,
  parseBackfillArgs,
  planBackfillEvents,
} from "./ghl-backfill-since.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("backfill args default to dry-run and require a timestamp", () => {
  assert.throws(() => parseBackfillArgs([]), /--since/);
  assert.throws(() => parseBackfillArgs(["--since", "not-a-date"]), /Invalid --since/);
  const dry = parseBackfillArgs(["--since", "2026-09-24T17:34:00Z"]);
  assert.equal(dry.dryRun, true);
  assert.equal(dry.since, "2026-09-24T17:34:00.000Z");
  const send = parseBackfillArgs(["--since", "2026-09-24 17:34:00Z", "--send"]);
  assert.equal(send.dryRun, false);
  const forced = parseBackfillArgs(["--send", "--since", "2026-09-24T17:34:00Z", "--dry-run"]);
  assert.equal(forced.dryRun, true);
});

test("backfill plans parent plus provider and tags test listings", () => {
  assert.deepEqual(planBackfillEvents({ email: "" }), []);
  const parent = planBackfillEvents({
    user_id: "u_parent",
    email: "sam@family.ca",
    name: "Sam Parent",
    phone: "2045550101",
    role: "parent",
  });
  assert.deepEqual(
    parent.map((event) => event.trigger),
    ["parent_signup"],
  );
  const provider = planBackfillEvents({
    user_id: "u_joan",
    email: "joan@kids.ca",
    name: "Joan",
    role: "provider",
    company: "Kids World Daycare",
    is_test: 0,
  });
  assert.deepEqual(
    provider.map((event) => event.trigger),
    ["parent_signup", "provider_signup"],
  );
  assert.equal(provider[1].testListing, false);
  assert.equal(provider[1].company, "Kids World Daycare");
  const qa = planBackfillEvents({
    user_id: "u_qa",
    email: "qa@kidease.ca",
    name: "QA",
    role: "parent",
    company: "TEST Ghost Claim Lab",
    is_test: 1,
  });
  assert.equal(qa[1].trigger, "provider_signup");
  assert.equal(qa[1].testListing, true);
  assert.match(describeBackfillEvent(qa[1], "2026-09-24T18:00:00.000Z"), /qa:test/);
  assert.match(describeBackfillEvent(qa[1], "2026-09-24T18:00:00.000Z"), /email=qa@kidease.ca/);
  assert.match(BACKFILL_USERS_SQL, /u\."createdAt" >= \$1/);
  assert.match(BACKFILL_USERS_SQL, /is_test/);
  const script = readFileSync(join(root, "scripts/ghl-backfill-since.mjs"), "utf8");
  assert.match(script, /Not run by CI/);
  assert.match(script, /postGhlCrmSignup/);
  const pkg = readFileSync(join(root, "package.json"), "utf8");
  assert.equal(pkg.includes("ghl-backfill-since"), false);
});
