import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { credentialStatus, ruleFor, scheduleDecision, screeningMode } from "../src/lib/compliance/screening.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

test("screening stays off and practice mode does not block a shift", () => {
  assert.equal(screeningMode({}), "off");
  assert.equal(screeningMode({ FEATURE_STAFF_SCREENING: "1" }), "dry_run");
  const practice = scheduleDecision({ mode: "dry_run", status: "expired" });
  assert.equal(practice.allow, true);
  assert.equal(practice.block, false);
  assert.equal(practice.warn, true);
  const live = scheduleDecision({ mode: "live", status: "expired" });
  assert.equal(live.allow, false);
  assert.equal(live.block, true);
  assert.equal(scheduleDecision({ mode: "off", status: "expired" }).allow, true);
  assert.equal(credentialStatus("2020-01-01", "2026-01-01"), "expired");
  assert.equal(credentialStatus("2026-12-01", "2026-01-01"), "current");
});

test("Alberta vulnerable sector interval is cited", () => {
  const rule = ruleFor("AB", "vulnerable_sector");
  assert.equal(rule?.validYears, 3);
  assert.equal(rule?.verified, true);
  assert.match(rule?.source || "", /143\/2008/);
  assert.equal(ruleFor("ON", "ece_cert"), null);
});

test("screening pages and the shift hook stay behind the flag", () => {
  assert.match(src(".env.example"), /^FEATURE_STAFF_SCREENING=0$/m);
  assert.match(src(".env.example"), /^FEATURE_STAFF_SCREENING_LIVE=0$/m);
  assert.match(src("src/lib/server/staff-scheduling.ts"), /screeningGate/);
  assert.match(src("src/routes/gov_.screening.tsx"), /guardGovDesk/);
  assert.match(src("migrations/0153_gov_staff_screening.sql"), /gov_province/);
  assert.match(src("src/components/compliance/frame.tsx"), /href="\/help"/);
});
