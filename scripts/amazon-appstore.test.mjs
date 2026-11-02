import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  AMAZON_APPSTORE_URL,
  amazonAppstoreDeepLink,
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
  assert.match(badges, /aria-disabled="true"/);
  assert.match(readFileSync(join(root, "src/lib/amazon-appstore.ts"), "utf8"), /amzn:\/\/apps\/android\?p=/);
});

test("Fire and Android use the Amazon app link; iPhone and desktop do not", () => {
  assert.equal(prefersAmazonDeepLink("Mozilla/5.0 (Linux; Android 14) Silk/120"), true);
  assert.equal(prefersAmazonDeepLink("Mozilla/5.0 (Linux; Android 14; Pixel 8)"), true);
  assert.equal(prefersAmazonDeepLink("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"), false);
  assert.equal(prefersAmazonDeepLink("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"), false);
  assert.equal(amazonAppstoreDeepLink("ca.kidease.app"), "amzn://apps/android?p=ca.kidease.app");
});
