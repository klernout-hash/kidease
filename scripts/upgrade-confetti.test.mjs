import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  UPGRADE_CONFETTI_COLORS,
  UPGRADE_CONFETTI_MS,
  burstUpgradeConfetti,
  prefersReducedMotion,
} from "../src/lib/upgrade-confetti.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (/\.(tsx?|mjs)$/.test(entry.name)) out.push(path);
  }
  return out;
}

test("upgrade confetti is a short brand burst", () => {
  assert.ok(UPGRADE_CONFETTI_MS >= 1500 && UPGRADE_CONFETTI_MS <= 2500);
  assert.equal(UPGRADE_CONFETTI_MS, 2000);
  assert.ok(UPGRADE_CONFETTI_COLORS.includes("#1a3790"));
  assert.ok(UPGRADE_CONFETTI_COLORS.includes("#6d89d8"));
  assert.ok(UPGRADE_CONFETTI_COLORS.includes("#1a7a5a"));
  assert.ok(UPGRADE_CONFETTI_COLORS.includes("#4ea882"));
  assert.ok(UPGRADE_CONFETTI_COLORS.includes("#eef2fb"));
  for (const hex of UPGRADE_CONFETTI_COLORS) {
    assert.doesNotMatch(hex, /#b42318|#8a5110/i);
  }

  const lib = src("src/lib/upgrade-confetti.ts");
  assert.match(lib, /import\("canvas-confetti"\)/);
  assert.match(lib, /useWorker:\s*false/);
  assert.match(lib, /pointerEvents = "none"/);
  assert.match(lib, /canvas\.remove\(\)/);
  assert.match(lib, /disableForReducedMotion:\s*true/);
  assert.equal(prefersReducedMotion(), true);
  const stop = burstUpgradeConfetti();
  assert.equal(typeof stop, "function");
  stop();
});

test("confetti fires only for a confirmed paid upgrade", () => {
  const files = walk(join(root, "src"));
  const dynamic = files.filter((file) => src(file.slice(root.length + 1)).includes('import("canvas-confetti")'));
  assert.deepEqual(
    dynamic.map((file) => file.slice(root.length + 1)),
    ["src/lib/upgrade-confetti.ts"],
  );

  const flagged = files.filter((file) => /confetti:\s*true/.test(src(file.slice(root.length + 1))));
  assert.deepEqual(
    flagged.map((file) => file.slice(root.length + 1)),
    ["src/components/checkout-return.tsx"],
  );

  const confirm = src("src/components/success-confirm.tsx");
  assert.match(confirm, /if \(!confetti \|\| reducedMotion\) return;\s*return burstUpgradeConfetti\(\)/);
  assert.doesNotMatch(confirm, /from ["']canvas-confetti["']/);
  assert.doesNotMatch(src("src/lib/success-confirm.ts"), /confetti:\s*true/);
  assert.doesNotMatch(src("src/components/checkout-return.tsx"), /canvas-confetti/);

  const celebrate = src("src/components/checkout-return.tsx");
  const cheer = celebrate.slice(celebrate.indexOf("confirmSuccess({"), celebrate.indexOf("replaceUpgradeReturn();", celebrate.indexOf("confirmSuccess({")));
  assert.match(cheer, /upgradeSuccessHeadline/);
  assert.match(cheer, /confetti:\s*true/);
  assert.doesNotMatch(src("src/components/provider-subscription.tsx").slice(
    src("src/components/provider-subscription.tsx").indexOf("async function postJob"),
    src("src/components/provider-subscription.tsx").indexOf("async function openPortal"),
  ), /confetti/);
});

test("cancel removes the canvas before the library starts", async () => {
  const removed = [];
  const canvas = {
    style: {},
    isConnected: false,
    setAttribute() {},
    remove() {
      this.isConnected = false;
      removed.push("removed");
    },
  };
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = {
    createElement() {
      return canvas;
    },
    body: {
      appendChild() {
        canvas.isConnected = true;
      },
    },
  };
  globalThis.window = {
    matchMedia() {
      return { matches: false };
    },
    setTimeout,
    clearTimeout,
  };
  try {
    const stop = burstUpgradeConfetti();
    assert.equal(canvas.style.pointerEvents, "none");
    assert.equal(canvas.style.position, "fixed");
    assert.equal(canvas.isConnected, true);
    stop();
    assert.deepEqual(removed, ["removed"]);
    assert.equal(canvas.isConnected, false);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(canvas.isConnected, false);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
