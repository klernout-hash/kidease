import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { STORE_PLACEHOLDER_REVIEW, showStoreComingSoon } from "../src/lib/store-placeholders.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("store apps hide the coming-soon store line; the website keeps it", () => {
  assert.equal(showStoreComingSoon("web"), true);
  for (const channel of ["apple", "google", "microsoft", "samsung", "huawei"]) {
    assert.equal(showStoreComingSoon(channel), false);
  }
  assert.match(src("src/routes/get-app.tsx"), /Coming soon on the App Store/);
  assert.match(src("src/routes/get-app.tsx"), /data-ke="store-coming-soon"/);
  assert.match(src("src/routes/get-app.tsx"), /data-ke="store-already-in-app"/);
  assert.match(src("src/components/site-footer.tsx"), /data-ke="store-coming-soon"/);
  assert.match(src("src/components/site-footer.tsx"), /showStoreComingSoon/);
  assert.match(src("src/routes/menu.tsx"), /marker="store-coming-soon"/);
  assert.match(src("src/routes/menu.tsx"), /showStores \?/);
  assert.match(src("src/routes/claim.tsx"), /perkMobile/);
  assert.match(src("src/components/saved-searches-panel.tsx"), /alertPushOff/);
  assert.match(src("src/components/saved-searches-panel.tsx"), /showStoreAppsLine/);
  assert.match(src("src/components/alert-push-settings.tsx"), /inPhoneApp \? null/);
  assert.match(src("src/routes/video.$roomId.tsx"), /native-video-unavailable/);
  assert.match(src("src/lib/desk-nav.ts"), /devOnly: true/);
  assert.ok(STORE_PLACEHOLDER_REVIEW.length >= 7);
  for (const row of STORE_PLACEHOLDER_REVIEW) {
    assert.match(row.inApp, /hidden|disclosed/);
    assert.match(src(row.file), /./);
  }
});
