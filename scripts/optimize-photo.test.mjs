import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { listingSrcToR2Key, r2ReadOriginalsEnabled } from "../src/lib/server/r2.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("/img dual-reads R2 then Git and still allow-lists /photos paths", () => {
  const source = readFileSync(join(root, "src/lib/server/optimize-photo.ts"), "utf8");
  assert.match(source, /readListingOriginal/);
  assert.match(source, /r2ReadOriginalsEnabled/);
  assert.match(source, /getR2Object/);
  assert.match(source, /public\/photos|public", src\.slice/);
  assert.match(source, /ALLOW = \/\^\\\/photos\\\//);
  assert.doesNotMatch(source, /BUILDING_ON_DISK/);

  const src = "/photos/storefront-placeholder-480.webp";
  assert.equal(listingSrcToR2Key(src), "originals/storefront-placeholder-480.webp");
  assert.equal(existsSync(join(root, "public", src.slice(1))), true);
  assert.equal(r2ReadOriginalsEnabled({}), false);
});
