import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { claimCityKeys, claimCityScore } from "../src/lib/claim-search.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("Winnipeg matches neighbourhood cities saved on a listing", () => {
  const keys = claimCityKeys("Winnipeg");
  assert.ok(keys.includes("winnipeg"));
  assert.ok(keys.includes("fort garry"));
  assert.ok(keys.includes("st vital"));
  assert.ok(keys.includes("transcona"));
  assert.equal(claimCityScore("Winnipeg", "Fort Garry"), 55);
  assert.equal(claimCityScore("Winnipeg", "St. Vital"), 55);
  assert.equal(claimCityScore("Winnipeg", "Winnipeg"), 60);
  assert.equal(claimCityScore("Winnipeg", "Brandon"), 0);
  assert.equal(claimCityScore("Winnipeg", "Winnipeg Beach"), 0);
  assert.equal(claimCityScore("Winnipeg", "Winnipegosis"), 0);
});

test("claim page leads with Find your centre", () => {
  const claim = readFileSync(join(root, "src/routes/claim.tsx"), "utf8");
  assert.match(claim, /claimFindTitle/);
  assert.match(claim, /data-ke="claim-find"/);
  const server = readFileSync(join(root, "src/lib/server/claims.ts"), "utf8");
  assert.match(server, /claimCityScore/);
});
