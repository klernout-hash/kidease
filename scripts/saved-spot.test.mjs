import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { spotsOpened } from "../src/lib/saved-spot.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("a saved-centre alert fires only when spots go up", () => {
  const before = { infant: 0, toddler: 1, preschool: 0 };
  assert.equal(spotsOpened(before, { infant: 1, toddler: 1, preschool: 0 }), true);
  assert.equal(spotsOpened(before, before), false);
  assert.equal(spotsOpened(before, { infant: 0, toddler: 0, preschool: 0 }), false);
  assert.equal(spotsOpened({ infant: 2, toddler: 0, preschool: 0 }, { infant: 0, toddler: 0, preschool: 3 }), true);
});

test("capacity updates tell saved parents through the spot-opened preference", () => {
  const family = readFileSync(join(root, "src/lib/server/family.ts"), "utf8");
  const fanout = readFileSync(join(root, "src/lib/server/alert-fanout.ts"), "utf8");
  assert.match(family, /notifySavedSpotOpened/);
  assert.match(fanout, /category: "spot_opened"/);
  assert.match(fanout, /saved-spot:/);
  assert.match(fanout, /from saved_daycares/);
});
