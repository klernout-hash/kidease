import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_MAX_DIFF_PIXEL_RATIO,
  DYNAMIC_MASK_SELECTORS,
  DYNAMIC_MAX_DIFF_PIXEL_RATIO,
  maxDiffPixelRatio,
  paintMaskRects,
  sampledPixelRatio,
} from "./desktop-visual.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("static pages stay at 0.4% and search pages use 1% after the mask", () => {
  assert.equal(DEFAULT_MAX_DIFF_PIXEL_RATIO, 0.004);
  assert.equal(DYNAMIC_MAX_DIFF_PIXEL_RATIO, 0.01);
  assert.equal(maxDiffPixelRatio("home"), 0.004);
  assert.equal(maxDiffPixelRatio("fr"), 0.004);
  assert.equal(maxDiffPixelRatio("login"), 0.004);
  assert.equal(maxDiffPixelRatio("search"), 0.01);
  assert.equal(maxDiffPixelRatio("daycares"), 0.01);
  const src = readFileSync(join(root, "scripts/desktop-visual.mjs"), "utf8");
  assert.doesNotMatch(src, /0\.25/);
  assert.match(src, /networkidle/);
  assert.match(src, /Plus Jakarta Sans/);
  assert.match(src, /français/);
  for (const selector of ["search-count", "search-result-list", "map-fallback"]) {
    assert.ok(DYNAMIC_MASK_SELECTORS.some((item) => item.includes(selector)));
  }
});

test("a masked rectangle is ignored by the pixel ratio", () => {
  const width = 4;
  const height = 1;
  const left = new Uint8Array(width * height * 4);
  const right = new Uint8Array(width * height * 4);
  right[0] = 255;
  right[1] = 255;
  right[2] = 255;
  const open = sampledPixelRatio(left, right);
  assert.ok(open.ratio > 0.004);
  paintMaskRects(left, width, height, [{ x: 0, y: 0, w: 1, h: 1 }]);
  paintMaskRects(right, width, height, [{ x: 0, y: 0, w: 1, h: 1 }]);
  const masked = sampledPixelRatio(left, right);
  assert.equal(masked.ratio, 0);
});
