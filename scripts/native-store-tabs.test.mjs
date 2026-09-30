import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { nativeStoreTabs } from "../src/lib/native-store-tabs.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("native store tabs are Search, Saved, Messages, Account", () => {
  for (const kind of ["guest", "parent"]) {
    const tabs = nativeStoreTabs(kind);
    assert.deepEqual(
      tabs?.map((tab) => tab.id),
      ["search", "saved", "messages", "account"],
    );
  }
  assert.equal(nativeStoreTabs("daycare"), null);
  assert.equal(nativeStoreTabs("admin"), null);
  const messages = nativeStoreTabs("parent")?.find((tab) => tab.id === "messages");
  assert.equal(messages?.to, "/inbox");
  assert.equal(JSON.stringify(nativeStoreTabs("guest")).toLowerCase().includes("coming soon"), false);
});

test("the phone website keeps the five-tab bar; native opts into the store set", () => {
  const bar = readFileSync(join(root, "src/components/app-tab-bar.tsx"), "utf8");
  assert.match(bar, /isNative\(\)/);
  assert.match(bar, /nativeStoreTabs/);
  assert.match(bar, /pb-\[env\(safe-area-inset-bottom\)\]/);
  assert.match(bar, /t\("messages"\)/);
  assert.doesNotMatch(bar, /coming soon/i);
});
