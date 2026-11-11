import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { GOV_MENU } from "../src/lib/gov/menu.ts";
import { guardPrivatePath } from "../src/lib/role-access.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the government desk has five matching pages", () => {
  assert.deepEqual(GOV_MENU.map((item) => item.en), [
    "Overview",
    "Expiries and alerts",
    "Analytics",
    "Reports",
    "Data and exports",
  ]);
  const frame = read("src/components/gov/gov-frame.tsx");
  assert.match(frame, /data-ke="gov-menu"/);
  assert.match(frame, /data-ke="gov-search"/);
  assert.match(frame, /data-ke="gov-province-lock"/);
  assert.match(frame, /data-ke="gov-as-of"/);
  assert.match(frame, /sticky top-0/);
  assert.match(frame, /overflow-x-auto/);
  assert.match(frame, /data-ke="gov-pill-fade"/);
  assert.match(read("src/components/gov/gov-dashboard.tsx"), /whitespace-nowrap hyphens-none/);
  assert.match(read("src/components/gov/gov-dashboard.tsx"), /data-ke="gov-not-connected"/);
  assert.match(read("src/components/gov/gov-dashboard.tsx"), /data-ke="gov-not-tracked"/);
  assert.match(read("src/components/gov/gov-dashboard.tsx"), /data-ke="gov-reports"/);
  assert.match(read("src/routes/gov_.change-requests.tsx"), /href: "\/gov"/);
  assert.match(read("scripts/e2e-smoke.mjs"), /gov-width-1280|width of \[1280, 820, 390\]/);
});

test("a government account cannot open admin, provider, or parent pages", () => {
  for (const path of ["/admin", "/provider", "/parent"]) {
    const decision = guardPrivatePath({ pathname: path, signedIn: true, role: "government" });
    assert.notEqual(decision.kind, "allow");
  }
});
