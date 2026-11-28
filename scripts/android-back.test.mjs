import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { androidBackDecision } from "../src/lib/android-back.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("Android back leaves the app only from home with an empty history", () => {
  assert.equal(androidBackDecision({ platform: "ios", path: "/", canGoBack: false }), "ignore");
  assert.equal(androidBackDecision({ platform: "android", path: "/", canGoBack: false }), "exit");
  assert.equal(androidBackDecision({ platform: "android", path: "/fr", canGoBack: false }), "exit");
  assert.equal(androidBackDecision({ platform: "android", path: "/", canGoBack: true }), "back");
  assert.equal(androidBackDecision({ platform: "android", path: "/daycare/kids-world", canGoBack: false }), "back");
  assert.equal(androidBackDecision({ platform: "android", path: "/search?q=Winnipeg", canGoBack: false }), "back");
});

test("Native boot listens for the Android back button", () => {
  const boot = readFileSync(join(root, "src/components/native-boot.tsx"), "utf8");
  assert.match(boot, /bindAndroidBack/);
  assert.match(boot, /history\.back/);
  assert.match(boot, /exitApp/);
});

test("Android Back lets managed overlays consume Escape before touching history", () => {
  const nativeBack = readFileSync(join(root, "src/lib/android-back.ts"), "utf8");
  assert.match(nativeBack, /!document.querySelector\("dialog\[open\]"\)/);
  assert.match(nativeBack, /new KeyboardEvent\("keydown", \{ key: "Escape", bubbles: true, cancelable: true \}\)/);
  assert.match(nativeBack, /if \(!document.dispatchEvent\(escape\)\) return;[\s\S]*androidBackDecision\(/);
  const search = readFileSync(join(root, "src/routes/search.tsx"), "utf8");
  assert.match(search, /event\.key !== "Escape" \|\| event\.defaultPrevented/);
  assert.match(search, /event\.preventDefault\(\);\s+closeFilters\(\);/);
});
