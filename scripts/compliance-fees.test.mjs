import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { feeDecision, feeMode } from "../src/lib/compliance/fees.ts";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");
test("fee caps stay off and only verified caps warn", () => {
  assert.equal(feeMode({}), "off");
  assert.equal(feeDecision({ mode: "off", province: "MB", ageKey: "infant", dailyCents: 5000 }).status, "off");
  const mb = feeDecision({ mode: "dry_run", province: "MB", ageKey: "infant", dailyCents: 1500 });
  assert.equal(mb.status, "warn");
  assert.equal(mb.delivery, "log");
  assert.equal(mb.verified, true);
  const live = feeDecision({ mode: "live", province: "ON", ageKey: "toddler", dailyCents: 2200 });
  assert.equal(live.status, "ok");
  assert.equal(feeDecision({ mode: "live", province: "BC", ageKey: "infant", dailyCents: 8000 }).status, "no_cap");
  assert.equal(feeDecision({ mode: "live", province: "AB", ageKey: "infant", dailyCents: 2000 }).status, "unknown");
});
test("fee pages do not block publish and keep help", () => {
  assert.match(src(".env.example"), /^FEATURE_FEE_CAPS=0$/m);
  assert.match(src(".env.example"), /^FEATURE_FEE_CAPS_LIVE=0$/m);
  assert.match(src("src/lib/server/claims.ts"), /noteMonthlyUnchecked/);
  assert.match(src("src/lib/server/billing.ts"), /noteMonthlyUnchecked/);
  assert.match(src("src/routes/gov_.fee-caps.tsx"), /guardGovDesk/);
  assert.match(src("src/components/compliance/frame.tsx"), /href="\/help"/);
});
