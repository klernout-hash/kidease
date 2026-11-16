import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function src(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("the parent home has one search step and jobs stay folded", () => {
  const home = src("src/components/parent-home.tsx");
  assert.match(home, /empty \? null : \([\s\S]*data-ke="parent-home-search"/);
  assert.match(home, /parentHomeFindAction/);
  const desk = src("src/components/parent-desk.tsx");
  assert.match(desk, /findDaycareJobs/);
  assert.match(desk, /EceJobDesk mode="parent"/);
  assert.match(desk, /<details/);
});
