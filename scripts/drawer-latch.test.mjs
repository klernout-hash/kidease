import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { nextDrawerLatch } from "../src/lib/drawer-latch.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("an open drawer keeps the role links when chrome goes pending", () => {
  const ready = nextDrawerLatch(true, true, "provider", false, null);
  assert.deepEqual(ready, { role: "provider", paid: false });
  const flickered = nextDrawerLatch(true, false, "guest", false, ready);
  assert.deepEqual(flickered, { role: "provider", paid: false });
  assert.equal(nextDrawerLatch(false, true, "provider", false, ready), null);
  assert.equal(nextDrawerLatch(true, false, "guest", false, null), null);
});

test("drawer and e2e keep the upgrade click instead of skipping it", () => {
  const drawer = readFileSync(join(root, "src/components/nav-drawer.tsx"), "utf8");
  const e2e = readFileSync(join(root, "scripts/e2e-smoke.mjs"), "utf8");
  assert.match(drawer, /nextDrawerLatch/);
  assert.match(drawer, /roleShown/);
  assert.match(e2e, /async function clickDrawerUpgrade/);
  assert.match(e2e, /daycare-checkout-two-clicks/);
  assert.match(e2e, /parent-plus-two-clicks/);
  assert.match(e2e, /clickDrawerUpgrade\(page\)/);
  assert.doesNotMatch(e2e, /test\.skip|describe\.skip|it\.skip/);
});
