import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { nativeStoreTabs } from "../src/lib/native-store-tabs.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("native uses the same role bars, so the store override stays empty", () => {
  for (const kind of ["guest", "parent", "daycare", "admin"]) {
    assert.equal(nativeStoreTabs(kind), null);
  }
  assert.equal(JSON.stringify(nativeStoreTabs("guest")).toLowerCase().includes("coming soon"), false);
});

test("the phone tab bar ends in Menu for every role", () => {
  const bar = readFileSync(join(root, "src/components/app-tab-bar.tsx"), "utf8");
  assert.match(bar, /isNative\(\)/);
  assert.match(bar, /nativeStoreTabs/);
  assert.match(bar, /pb-\[var\(--ke-safe-bottom,env\(safe-area-inset-bottom\)\)\]/);
  assert.match(bar, /t\("messages"\)/);
  assert.match(bar, /t\("navMenu"\)/);
  assert.match(bar, /t\("navCalendar"\)/);
  assert.match(bar, /t\("inbox"\)/);
  assert.doesNotMatch(bar, /coming soon/i);
});
