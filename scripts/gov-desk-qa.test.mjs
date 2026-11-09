import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { govActorProvince, govProvinceChoices, govScopeProvince } from "../src/lib/gov/province-choice.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("a province desk cannot widen to all of Canada", () => {
  const manitoba = govActorProvince("MB");
  assert.deepEqual(manitoba, { province: "MB", national: false });
  assert.equal(govScopeProvince(manitoba, "ALL"), "MB");
  assert.equal(govScopeProvince(manitoba, "ON"), "MB");
  const choices = govProvinceChoices(
    [
      { code: "ALL", name: "All of Canada" },
      { code: "MB", name: "Manitoba" },
      { code: "ON", name: "Ontario" },
    ],
    manitoba,
  );
  assert.deepEqual(choices.map((row) => row.code), ["MB"]);
});

test("only a Canada organization sees every province", () => {
  const canada = govActorProvince("CA");
  assert.equal(canada.national, true);
  assert.equal(govScopeProvince(canada, "ON"), "ON");
  assert.equal(govScopeProvince(canada, "ALL"), "ALL");
  assert.equal(govActorProvince("ALL").national, true);
  const choices = govProvinceChoices(
    [
      { code: "ALL", name: "All of Canada" },
      { code: "MB", name: "Manitoba" },
    ],
    canada,
  );
  assert.deepEqual(choices.map((row) => row.code), ["ALL", "MB"]);
});

test("gov desk fixes stay in the screens Test Bot used", () => {
  const dash = read("src/components/gov/gov-dashboard.tsx");
  const jobs = read("src/components/ece-job-desk.tsx");
  const map = read("src/components/gov/gov-map.tsx");
  const guard = read("src/lib/gov/desk-guard.ts");
  const signOut = read("src/lib/auth/client.ts");
  assert.match(dash, /const region = next\.region \?\? data\.region/);
  assert.match(jobs, /data-ke="gov-jobs-off"/);
  assert.doesNotMatch(jobs, /if \(!row\?\.enabled\) return null/);
  assert.match(map, /mapHostStyle/);
  assert.match(map, /gov-map-empty/);
  assert.match(guard, /typeof window === "undefined" && !govPortalFooterEnabled\(\)/);
  assert.match(signOut, /push-release-timeout/);
});
