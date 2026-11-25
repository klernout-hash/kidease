import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  AMAZON_STORE_URL,
  APP_STORES,
  HUAWEI_STORE_URL,
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
  assert.equal(huawei?.url, HUAWEI_STORE_URL);
  assert.equal(HUAWEI_STORE_URL, "https://appgallery.huawei.com/#/app/C119648761");
  assert.equal(apple?.live, false);
  assert.equal(apple?.url, null);
  assert.equal(liveAppStores().every((store) => store.url), true);
  assert.equal(liveAppStores().some((store) => store.id === "huawei"), true);
});

test("the share link sends a phone to its store and everyone else to the list", () => {
  assert.equal(storeForDevice("Mozilla/5.0 (Linux; Android 14; Pixel) AppleWebKit")?.id, "play");
  assert.equal(storeForDevice("Mozilla/5.0 (Linux; Android 11; KFTRWI) Silk/120")?.id, "amazon");
  assert.equal(storeForDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)"), null);
  assert.equal(storeForDevice("Mozilla/5.0 (Linux; Android 12; HUAWEI ANA-NX9)")?.id, "huawei");
  assert.equal(storeForDevice("Mozilla/5.0 (Linux; Android 12; HUAWEI ANA-NX9)")?.url, HUAWEI_STORE_URL);
  assert.equal(appShareUrl("https://kidease.ca/"), "https://kidease.ca/app");
});

test("Android Chrome gets Google Play first; a Fire device or ke_store=amazon gets Amazon", () => {
  const chrome = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
  const samsung = "Mozilla/5.0 (Linux; Android 14; SM-S918W) AppleWebKit/537.36 SamsungBrowser/24.0 Chrome/117 Mobile Safari/537.36";
  const fire = "Mozilla/5.0 (Linux; Android 11; KFTRWI) AppleWebKit/537.36 (KHTML, like Gecko) Silk/120.1 like Chrome/120 Safari/537.36";
  assert.equal(storeForDevice(chrome)?.id, "play");
  assert.equal(storeForDevice(chrome)?.url, PLAY_STORE_URL);
  assert.equal(storeForDevice(samsung)?.id, "play");
  assert.equal(storeForDevice(fire)?.id, "amazon");
  assert.equal(storeForDevice(fire)?.url, AMAZON_STORE_URL);
  assert.equal(storeForDevice(chrome, APP_STORES, "ke_store=amazon")?.id, "amazon");
  assert.equal(storeForDevice(chrome, APP_STORES, "ke_store=microsoft")?.id, "play");
  // If Amazon were not live, a Fire device still gets a working store.
  const noAmazon = APP_STORES.map((store) => (store.id === "amazon" ? { ...store, live: false } : store));
  assert.equal(storeForDevice(fire, noAmazon)?.id, "play");
  const href = readFileSync(join(root, "src/lib/server/app-store-href.ts"), "utf8");
  assert.match(href, /headers\?\.get\("cookie"\)/);
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
