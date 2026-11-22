import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("the native shell has a bundled EN/FR offline page and a splash timeout", () => {
  const page = src("native-www/index.html");
  const android = src("android/app/src/main/assets/offline/index.html");
  assert.equal(page, android);
  assert.match(page, /You're offline/);
  assert.match(page, /Vous êtes hors ligne/);
  assert.match(page, /Réessayer/);
  assert.match(page, /ke-offline-shortlist/);
  assert.match(page, /https:\/\/www\.kidease\.ca\//);
  assert.doesNotMatch(page, /location\.replace\("https:\/\/www\.kidease\.ca"\)/);
  assert.match(page, /id="retry"/);
  assert.match(src("capacitor.config.ts"), /errorPath: "index.html"/);
  assert.match(src("ios/App/App/capacitor.config.json"), /"errorPath": "index.html"/);
  assert.match(src("android/app/src/main/assets/capacitor.config.json"), /"errorPath": "index.html"/);
  const ios = src("ios/App/App/KidEaseBridgeViewController.swift");
  assert.match(ios, /scheduleOfflineCheck\(after: 12\)/);
  assert.match(ios, /NWPathMonitor/);
  assert.match(ios, /CapacitorStorage\.ke-offline-shortlist/);
  const java = src("android/app/src/main/java/ca/kidease/app/MainActivity.java");
  assert.match(java, /postDelayed\(this::offlineTimedOut, 12000\)/);
  assert.match(java, /onLost/);
  assert.match(src("android/app/src/main/java/ca/kidease/app/OfflinePage.java"), /offline\/index\.html/);
  assert.match(src("android/app/src/main/java/ca/kidease/app/AdminWebOnlyClient.java"), /OfflinePage\.show/);
});
