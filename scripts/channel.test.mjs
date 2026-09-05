import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const STOREFRONT_MIN_PX = 1024;

function resolveChannel({ native, widthPx }) {
  if (native) return "app";
  return widthPx >= STOREFRONT_MIN_PX ? "website" : "app";
}

test("storefront is wide browser only; Capacitor is always the compact app", () => {
  assert.equal(resolveChannel({ native: false, widthPx: 1440 }), "website");
  assert.equal(resolveChannel({ native: false, widthPx: 1024 }), "website");
  assert.equal(resolveChannel({ native: false, widthPx: 1023 }), "app");
  assert.equal(resolveChannel({ native: false, widthPx: 390 }), "app");
  assert.equal(resolveChannel({ native: true, widthPx: 1440 }), "app");
  assert.equal(resolveChannel({ native: true, widthPx: 390 }), "app");
});

test("runtime.ts documents the same lg / Capacitor split", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const src = readFileSync(join(root, "src/lib/runtime.ts"), "utf8");
  const boot = readFileSync(join(root, "public/channel-boot.js"), "utf8");
  const rootHtml = readFileSync(join(root, "src/routes/__root.tsx"), "utf8");
  assert.match(src, /STOREFRONT_MIN_PX = 1024/);
  assert.match(src, /if \(input\.forceApp \|\| input\.native\) return "app"/);
  assert.match(boot, /w < 1024/);
  assert.match(rootHtml, /src="\/channel-boot\.js"/);
  assert.doesNotMatch(rootHtml, /dangerouslySetInnerHTML=\{\{ __html: CHANNEL_BOOT_SCRIPT \}\}/);
});
