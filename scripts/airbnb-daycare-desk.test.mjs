import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { providerDeskFromQuery } from "../src/lib/desk-nav.ts";

test("Today keeps one primary confirm and folds daily care", () => {
  const home = readFileSync(new URL("../src/components/today-urgency-home.tsx", import.meta.url), "utf8");
  assert.match(home, /firstTourId/);
  assert.match(home, /variant=\{row\.tourId === firstTourId \? "primary" : "secondary"\}/);
  assert.match(home, /t\("dailyCare"\)/);
  assert.match(home, /DailyCareDesk role="provider"/);
  assert.match(home, /SetupProgress/);
  assert.equal(providerDeskFromQuery(undefined, "?desk=earnings"), "money");
});
