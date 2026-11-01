import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { changeRequestsEnabled, listingPatch, parseChangeValue, reviewChange } from "../src/lib/wiring/change-requests.ts";

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../src/lib/server/wiring/change-requests.ts"), "utf8");

test("listing changes wait for the same province and do not geocode", () => {
  assert.equal(changeRequestsEnabled({}), false);
  assert.equal(parseChangeValue("capacity", 0).ok, false);
  assert.equal(parseChangeValue("address", "12 Portage Ave").ok, true);
  const denied = reviewChange({ decision: "approve", actorProvince: "ON", recordProvince: "MB", writable: true });
  assert.equal(denied.ok, false);
  const allowed = reviewChange({ decision: "approve", actorProvince: "MB", recordProvince: "MB", writable: true });
  assert.equal(allowed.ok, true);
  assert.deepEqual(listingPatch("address", "12 Portage Ave"), { address: "12 Portage Ave" });
  assert.equal("lat" in listingPatch("address", "12 Portage Ave"), false);
  assert.doesNotMatch(src, /google|maps\.googleapis/i);
});
