import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { FEEL_ENCODE_STEMS, FEEL_ENCODE_WIDTHS } from "./encode-feel-photos.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("home cottage/kitchen ship AVIF and WebP at 768 and 1200", () => {
  assert.deepEqual(FEEL_ENCODE_STEMS, ["cottage", "kitchen"]);
  assert.deepEqual([...FEEL_ENCODE_WIDTHS], [768, 1200]);
  for (const stem of FEEL_ENCODE_STEMS) {
    const original = join(root, "public/photos", `${stem}.jpg`);
    assert.equal(existsSync(original), true, original);
    for (const width of FEEL_ENCODE_WIDTHS) {
      for (const ext of ["avif", "webp", "jpg"]) {
        const rel = `public/photos/${stem}-${width}.${ext}`;
        const path = join(root, rel);
        assert.equal(existsSync(path), true, rel);
        assert.ok(statSync(path).size > 4_000, `${rel} should be a real image`);
        assert.ok(statSync(path).size < statSync(original).size, `${rel} should beat the source JPEG`);
      }
    }
  }
});
