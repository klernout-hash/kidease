import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  AMAZON_APPSTORE_URL,
  amazonAppstoreDeepLink,
  amazonStoreCookie,
  isAmazonDevice,
  prefersAmazonDeepLink,
} from "../src/lib/amazon-appstore.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("Amazon listing URL stays empty until the env is a real https listing", () => {
  const previous = process.env.NEXT_PUBLIC_AMAZON_APPSTORE_URL;
  delete process.env.NEXT_PUBLIC_AMAZON_APPSTORE_URL;
  assert.equal(AMAZON_APPSTORE_URL(), null);
  assert.equal(AMAZON_APPSTORE_URL(""), null);
  assert.equal(AMAZON_APPSTORE_URL("https://example.com/dp/B0TEST0001"), null);
  assert.equal(AMAZON_APPSTORE_URL("http://www.amazon.ca/dp/B0TEST0001"), null);
  assert.equal(AMAZON_APPSTORE_URL("https://www.amazon.ca/"), null);
  assert.equal(AMAZON_APPSTORE_URL("https://www.amazon.ca/s?k=KidEase"), null);
  assert.equal(AMAZON_APPSTORE_URL("https://www.amazon.ca/dp/short"), null);
  const listing = "https://www.amazon.ca/dp/B0TEST0001";
  assert.equal(AMAZON_APPSTORE_URL(listing), listing);
  assert.equal(
    AMAZON_APPSTORE_URL("https://www.amazon.com/gp/mas/dl/android?p=ca.kidease.app"),
    "https://www.amazon.com/gp/mas/dl/android?p=ca.kidease.app",
  );
  assert.equal(AMAZON_APPSTORE_URL("https://www.amazon.com/gp/mas/dl/android"), null);
  process.env.NEXT_PUBLIC_AMAZON_APPSTORE_URL = "https://www.amazon.com/gp/product/B0TEST0001";
  assert.equal(AMAZON_APPSTORE_URL(), "https://www.amazon.com/gp/product/B0TEST0001");
  if (previous == null) delete process.env.NEXT_PUBLIC_AMAZON_APPSTORE_URL;
  else process.env.NEXT_PUBLIC_AMAZON_APPSTORE_URL = previous;

  const page = readFileSync(join(root, "src/routes/get-app.tsx"), "utf8");
  const badges = readFileSync(join(root, "src/components/store-badges.tsx"), "utf8");
  assert.doesNotMatch(page + badges, /amazon\.ca\/dp\/B0[A-Z0-9]{8}/);
  assert.match(badges, /data-ke="amazon-appstore"/);
  assert.match(badges, /return amazonUrl \? amazonTile : null/);
  assert.match(readFileSync(join(root, "src/lib/amazon-appstore.ts"), "utf8"), /amzn:\/\/apps\/android\?p=/);
});

test("Fire uses the Amazon app link; Android Chrome, iPhone and desktop do not", () => {
  assert.equal(prefersAmazonDeepLink("Mozilla/5.0 (Linux; Android 14) Silk/120"), true);
  assert.equal(prefersAmazonDeepLink("Mozilla/5.0 (Linux; Android 11; KFTRWI) AppleWebKit"), true);
  // Most Android phones have no Amazon Appstore app: they follow the web link.
  assert.equal(prefersAmazonDeepLink("Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120"), false);
  assert.equal(prefersAmazonDeepLink("Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120", "a=1; ke_store=amazon"), true);
  assert.equal(prefersAmazonDeepLink("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"), false);
  assert.equal(prefersAmazonDeepLink("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"), false);
  assert.equal(amazonAppstoreDeepLink("ca.kidease.app"), "amzn://apps/android?p=ca.kidease.app");
});

test("Amazon leads only on Amazon devices or with the ke_store=amazon cookie", () => {
  const pixel = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36";
  const fire = "Mozilla/5.0 (Linux; Android 11; KFTRWI) AppleWebKit/537.36 Silk/120 like Chrome/120 Safari/537.36";
  assert.equal(isAmazonDevice(pixel), false);
  assert.equal(isAmazonDevice(fire), true);
  assert.equal(isAmazonDevice("Mozilla/5.0 (Linux; Android 9; KFMAWI)"), true);
  assert.equal(isAmazonDevice(pixel, "ke_store=amazon"), true);
  assert.equal(isAmazonDevice(pixel, "ke_store=microsoft"), false);
  assert.equal(isAmazonDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)", "ke_store=amazon"), false);
  assert.equal(amazonStoreCookie("x=1; ke_store=amazon; y=2"), true);
  assert.equal(amazonStoreCookie("ke_store=amazonx"), false);

  const page = readFileSync(join(root, "src/routes/get-app.tsx"), "utf8");
  assert.match(page, /setAmazonDevice\(isAmazonDevice\(navigator\.userAgent, document\.cookie\)\)/);
  assert.match(page, /const amazonFirst = Boolean\(amazonUrl\) && amazonDevice;/);
  assert.match(page, /const installVariant = amazonFirst && showStores \? "secondary" : "primary";/);
  assert.match(page, /lead="amazon"/);
  assert.match(page, /lead="play"/);
  const badges = readFileSync(join(root, "src/components/store-badges.tsx"), "utf8");
  assert.match(badges, /lead = "play"/);
  assert.match(badges, /data-ke="play-store-lead"/);
});
