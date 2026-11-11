import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { accessNeed, facilityRisk, govOversightEnabled, OVERSIGHT_ITEMS } from "../src/lib/gov/oversight.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("oversight scores stay off and missing data is not a low risk", () => {
  assert.equal(govOversightEnabled({}), false);
  assert.equal(govOversightEnabled({ FEATURE_GOV_OVERSIGHT: "1" }), true);
  assert.deepEqual(facilityRisk({ enabled: false, factors: { compliance: 0 } }), { blocked: true, reason: "flag_off" });
  assert.deepEqual(facilityRisk({ enabled: true, factors: {} }), { blocked: true, reason: "no_agreement" });
  const scored = facilityRisk({ enabled: true, factors: { compliance: 1, enforcement: null } });
  assert.equal(scored.blocked, false);
  if (!scored.blocked) {
    assert.ok(scored.score > 25);
    assert.ok(scored.reasons.some((reason) => reason.includes("missing")));
  }
});

test("a child care desert needs both children and spaces", () => {
  assert.deepEqual(accessNeed({ spaces: 10, children: null }), { childrenPerSpace: null, desert: null });
  assert.deepEqual(accessNeed({ spaces: 10, children: 40 }), { childrenPerSpace: 4, desert: true });
  assert.equal(OVERSIGHT_ITEMS.find((item) => item.id === "expiry")?.state, "agreement");
  assert.equal(OVERSIGHT_ITEMS.find((item) => item.id === "licensed")?.state, "public");
});

test("the oversight panel does not send mail", () => {
  const src = readFileSync(join(root, "src/components/gov/gov-dashboard.tsx"), "utf8");
  const block = src.slice(src.indexOf("function OversightNote"));
  assert.equal(block.includes("mailto:"), false);
  assert.equal(block.includes("sendMail"), false);
  assert.match(block, /data-ke="gov-oversight"/);
});
