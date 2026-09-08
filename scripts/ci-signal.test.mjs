import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PRODUCTION_CFR_SIGNAL, PRODUCTION_HEALTH_SIGNAL } from "../src/lib/uptime.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("CI check job stays fail-fast and cancels superseded runs", () => {
  const workflow = src(".github/workflows/ci.yml");
  const eslint = src("eslint.config.mjs");
  assert.match(workflow, /npx eslint \./);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npx tsc --noEmit/);
  assert.match(workflow, /cancel-in-progress: true/);
  assert.match(workflow, /group: ci-/);
  assert.match(workflow, /Pipeline fail-rate is not production CFR/);
  assert.match(workflow, /production_health/);
  assert.match(eslint, /"no-unused-vars": "off"/);
  assert.match(eslint, /"no-useless-escape": "warn"/);
  assert.match(eslint, /@typescript-eslint\/no-unused-vars/);
});

test("production health signal is not the Actions fail-rate", () => {
  assert.equal(PRODUCTION_HEALTH_SIGNAL, "production_health");
  assert.equal(PRODUCTION_CFR_SIGNAL, "production_change_failure");
  assert.match(src("docs/uptime.md"), /CI fail-rate is not production CFR/);
  assert.match(src("docs/e2e.md"), /pipeline noise/);
  assert.match(src("SECURITY.md"), /production_health/);
  assert.match(src("SECURITY.md"), /production_change_failure/);
  assert.match(src("src/lib/uptime.ts"), /signal: PRODUCTION_HEALTH_SIGNAL/);
  assert.match(src("src/lib/uptime.ts"), /cfr: buildHealthCfr/);
  assert.doesNotMatch(src("docs/uptime.md"), /BETTERSTACK_HEARTBEAT_URL=https:\/\//);
});
