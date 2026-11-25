import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function src(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("the parent home has one search step and jobs stay off the dashboard", () => {
  const home = src("src/components/parent-home.tsx");
  assert.match(home, /empty \? null : \([\s\S]*data-ke="parent-home-search"/);
  assert.match(home, /parentHomeFindAction/);
  const desk = src("src/components/parent-desk.tsx");
  assert.doesNotMatch(desk, /findDaycareJobs|EceJobDesk/);
  assert.match(src("src/routes/jobs.tsx"), /EceJobBoard/);
  assert.match(src("src/components/app-tab-bar.tsx"), /search=\{\{ tab: "requests" \}\}/);
  // "Tour requested" now comes from the shared label used by home and Requests (#1014 item 10).
  assert.match(src("src/components/parent-requests.tsx"), /parentRequestStatusLabelKey\(row\)/);
  assert.match(src("src/lib/parent-request-rows.ts"), /parentRequestTourAsked/);
  assert.doesNotMatch(src("src/components/parent-requests.tsx"), /SOFT-HOLD/);
});
