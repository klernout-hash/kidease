import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { applyTextScale, textScaleFactor, textScalePercent } from "../src/lib/text-scale.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("text size grows the root font and never locks pinch zoom", () => {
  assert.equal(textScalePercent("md"), "100%");
  assert.equal(textScalePercent("lg"), "112.5%");
  assert.equal(textScalePercent("xl"), "125%");
  assert.equal(textScaleFactor("md"), "1");
  assert.equal(textScaleFactor("lg"), "1.125");
  assert.equal(textScaleFactor("xl"), "1.25");
  const props = {};
  const el = {
    style: {
      fontSize: "14px",
      setProperty(name, value) {
        props[name] = value;
      },
    },
    dataset: {},
  };
  applyTextScale("lg", el);
  assert.equal(el.style.fontSize, "");
  assert.equal(props["--ke-text-scale"], "1.125");
  assert.equal(el.dataset.textScale, "lg");
  applyTextScale("md", el);
  assert.equal(props["--ke-text-scale"], "1");
  const app = src("src/routes/__root.tsx");
  assert.doesNotMatch(app, /maximum-scale|user-scalable\s*=\s*["']no/i);
});

test("listing photos and text size use bilingual labels", () => {
  const carousel = src("src/components/listing-carousel.tsx");
  const copy = src("src/lib/copy.ts");
  const appearance = src("src/components/appearance-control.tsx");
  assert.match(carousel, /t\("photoPrev"\)/);
  assert.match(carousel, /t\("photoNext"\)/);
  assert.match(carousel, /min-h-11 min-w-11/);
  assert.doesNotMatch(carousel, /aria-label="Previous photo"/);
  assert.match(copy, /photoPrev: "Previous photo"/);
  assert.match(copy, /photoPrev: "Photo précédente"/);
  assert.match(copy, /photoNext: "Photo suivante"/);
  assert.match(copy, /textSizeHint: "Larger text stays on this device. Pinch zoom still works."/);
  assert.match(copy, /Le zoom par pincement fonctionne encore/);
  assert.match(appearance, /aria-labelledby="text-size-label"/);
  assert.match(appearance, /setTextScale/);
  assert.doesNotMatch(copy, /United States/);
});
