import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CHILDREN_0_TO_5_2021,
  CHILDREN_0_TO_5_SOURCE,
  children0to5,
  childrenPerLicensedSpace,
} from "../src/lib/gov/places.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("children aged 0 to 5 are the published census-family counts", () => {
  assert.equal(children0to5("MB"), 93690);
  assert.equal(children0to5("ALL"), 2208195);
  assert.equal(CHILDREN_0_TO_5_2021.ON, 827350);
  assert.match(CHILDREN_0_TO_5_SOURCE, /98-10-0666/);
  const provinces = Object.entries(CHILDREN_0_TO_5_2021).filter(([code]) => code !== "ALL");
  const sum = provinces.reduce((total, [, n]) => total + n, 0);
  assert.ok(Math.abs(sum - CHILDREN_0_TO_5_2021.ALL) < 20);
  assert.equal(childrenPerLicensedSpace(93690, 48473), 1.9);
  assert.equal(childrenPerLicensedSpace(100, 0), null);
  assert.equal(childrenPerLicensedSpace(null, 10), null);
});

test("the desk names the missing register and does not send alerts", () => {
  const dash = read("src/components/gov/gov-dashboard.tsx");
  const data = read("src/lib/server/gov-data.server.ts");
  assert.match(dash, /data-ke="gov-child-ratio"/);
  assert.match(dash, /data-ke="gov-centre-flags"/);
  assert.match(dash, /alertsNotWired/);
  assert.match(dash, /registerNotLoaded/);
  assert.doesNotMatch(dash, /<GovDeskNav/);
  assert.match(data, /license_status/);
  assert.doesNotMatch(data, /select[^;]*email/i);
});
