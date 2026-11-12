import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  AMAZON_STORE_URL,
  APP_STORES,
  PLAY_STORE_URL,
  appShareUrl,
  liveAppStores,
  storeForDevice,
} from "../src/lib/app-stores.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("confirmed store availability does not invent an unknown download link", () => {
  const play = APP_STORES.find((store) => store.id === "play");
  const amazon = APP_STORES.find((store) => store.id === "amazon");
  const huawei = APP_STORES.find((store) => store.id === "huawei");
  const apple = APP_STORES.find((store) => store.id === "apple");
  assert.equal(play?.live, true);
  assert.equal(play?.url, PLAY_STORE_URL);
  assert.match(PLAY_STORE_URL, /id=ca\.kidease\.app$/);
  assert.equal(amazon?.live, true);
  assert.equal(amazon?.url, AMAZON_STORE_URL);
  assert.equal(huawei?.live, true);
  assert.equal(huawei?.url, null);
  assert.equal(apple?.live, false);
  assert.equal(apple?.url, null);
  assert.equal(liveAppStores().every((store) => store.url), true);
  assert.equal(liveAppStores().some((store) => store.id === "huawei"), false);
});

test("the share link sends a phone to its store and everyone else to the list", () => {
  assert.equal(storeForDevice("Mozilla/5.0 (Linux; Android 14; Pixel) AppleWebKit")?.id, "play");
  assert.equal(storeForDevice("Mozilla/5.0 (Linux; Android 11; KFTRWI) Silk/120")?.id, "amazon");
  assert.equal(storeForDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)"), null);
  assert.equal(storeForDevice("Mozilla/5.0 (Linux; Android 12; HUAWEI ANA-NX9)"), null);
  assert.equal(appShareUrl("https://kidease.ca/"), "https://kidease.ca/app");
});

test("the store section does not mention subscriptions or prices", () => {
  const files = [
    "src/components/app-store-status.tsx",
    "src/lib/app-stores.ts",
    "src/routes/app.tsx",
  ].map((file) => readFileSync(join(root, file), "utf8").toLowerCase());
  for (const src of files) {
    assert.equal(src.includes("subscription"), false);
    assert.equal(src.includes("pricing"), false);
    assert.equal(src.includes("/plans"), false);
  }
});
