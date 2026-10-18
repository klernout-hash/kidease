import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { tx } from "../src/lib/copy.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("home explainer is desktop website only, lazy, and below featured centres", () => {
  const home = src("src/routes/index.tsx");
  const video = src("src/components/home-how-video.tsx");
  const css = src("src/styles.css");
  assert.equal((home.match(/<HomeHowVideo \/>/g) ?? []).length, 1);

  const web = home.slice(home.indexOf("ke-web-only"), home.indexOf("ke-app-only"));
  const featuredAt = web.indexOf('id="featured"');
  const howAt = web.indexOf('id="how"');
  const videoAt = web.indexOf("<HomeHowVideo />");
  const stepsAt = web.indexOf('photo="/photos/cottage.jpg"');
  assert.ok(featuredAt >= 0 && howAt > featuredAt && videoAt > howAt && stepsAt > videoAt);
  assert.equal((web.match(/howVideoTitle/g) ?? []).length, 1);
  const howBlock = web.slice(howAt, web.indexOf('id="enroll"'));
  assert.equal((howBlock.match(/<h2/g) ?? []).length, 1);
  assert.match(howBlock, /howVideoTitle/);
  assert.doesNotMatch(howBlock, /howStressFree/);
  assert.doesNotMatch(video, /<h2/);

  const app = home.slice(home.indexOf("ke-home-app"));
  assert.doesNotMatch(app, /HomeHowVideo/);

  assert.match(css, /\.ke-how-video \{\n\s*display: none !important;/);
  assert.match(css, /@media \(min-width: 1024px\) \{\n\s*html\[data-runtime="web"\] \.ke-how-video/);
  assert.match(css, /html\[data-runtime="ios"\] \.ke-how-video/);
  assert.match(css, /html\[data-runtime="android"\] \.ke-how-video/);
  assert.match(video, /matchMedia\(DESKTOP_QUERY\)/);
  assert.match(video, /DESKTOP_QUERY = "\(min-width: 1024px\)"/);
  assert.match(video, /if \(!desktop\) return/);
  assert.match(video, /if \(!window\.matchMedia\(DESKTOP_QUERY\)\.matches\) return/);

  assert.match(video, /IntersectionObserver/);
  assert.match(video, /rootMargin: "240px 0px"/);
  assert.match(video, /visibilitychange/);
  assert.match(video, /prefers-reduced-motion: reduce/);
  assert.match(video, /preload="none"/);
  assert.match(video, /playsInline/);
  assert.match(video, /loop/);
  assert.match(video, /aspect-video/);
  assert.match(video, /rounded-\[14px\]/);
  assert.match(video, /object-cover/);
  assert.match(video, /\/video\/how-kidease\.webp/);
  assert.match(video, /\/video\/how-kidease\.mp4/);
  assert.match(video, /controls=\{false\}/);
  assert.doesNotMatch(video, /controls=\{true\}/);
  assert.match(video, /srcOn \? \(/);
  assert.match(video, /video\.pause\(\)/);
  assert.match(video, /video\.muted = !wantSound/);
  assert.match(video, /setSoundBlocked\(true\)/);
  assert.match(video, /howVideoPlayWithSound/);
  assert.match(video, /useState\(false\)/);
  assert.doesNotMatch(video, /muted\n/);
  assert.doesNotMatch(video, /autoPlay=/);
  assert.doesNotMatch(video, /how-kidease\.webm/);
  assert.doesNotMatch(video, /—/);
});

test("explainer copy, poster, and mp4 stay small", () => {
  assert.equal(tx("en", "howVideoTitle"), "Here's how KidEase works");
  assert.equal(tx("fr", "howVideoTitle"), "Voici comment fonctionne KidEase");
  assert.equal(tx("en", "howVideoPlay"), "Play video");
  assert.equal(tx("en", "howVideoPlayWithSound"), "Play with sound");
  assert.equal(tx("fr", "howVideoPlayWithSound"), "Lire avec le son");
  assert.equal(tx("fr", "howVideoPause"), "Mettre la vidéo en pause");
  for (const key of ["howVideoTitle", "howVideoPlay", "howVideoPause", "howVideoSoundOn", "howVideoSoundOff", "howVideoPlayWithSound"]) {
    assert.doesNotMatch(tx("en", key), /—|free forever/i);
    assert.doesNotMatch(tx("fr", key), /—|gratuit pour toujours/i);
  }

  const mp4 = statSync(join(root, "public/video/how-kidease.mp4"));
  const webp = statSync(join(root, "public/video/how-kidease.webp"));
  assert.ok(mp4.size < 2.5 * 1024 * 1024, `mp4 ${mp4.size} should stay under 2.5MB`);
  assert.ok(webp.size < 40 * 1024, `poster ${webp.size} should stay under 40KB`);
  const mp4Head = readFileSync(join(root, "public/video/how-kidease.mp4")).subarray(4, 8).toString("ascii");
  assert.equal(mp4Head, "ftyp");
  const poster = readFileSync(join(root, "public/video/how-kidease.webp"));
  assert.equal(poster.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(poster.subarray(8, 12).toString("ascii"), "WEBP");
  assert.match(src("vercel.json"), /\/video\/\(\.\*\)/);
});
