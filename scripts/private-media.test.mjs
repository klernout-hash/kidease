import assert from "node:assert/strict";
import { test } from "node:test";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { privateMediaEnabled } from "../src/lib/features.ts";
import {
  PRIVATE_MEDIA_TTL_SEC,
  carePhotosForViewer,
  clampPrivateTtl,
  isPrivateMediaKey,
  isPublicMediaUrl,
  privateMediaKey,
  privatePhotoAccepted,
} from "../src/lib/private-media.ts";

test("private media defaults off and still shows a saved photo", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_PRIVATE_MEDIA, false);
  assert.equal(privateMediaEnabled({}), false);
  const saved = carePhotosForViewer([{ src: "https://media.kidease.ca/public/day.jpg" }], { enabled: false });
  assert.equal(saved[0]?.src, "https://media.kidease.ca/public/day.jpg");
  assert.equal(privatePhotoAccepted("https://media.kidease.ca/public/day.jpg", false), true);
});

test("flag on returns only a short signed link and drops public URLs", () => {
  const key = privateMediaKey("daily-log", "centre1", "nap.jpg");
  const story = privateMediaKey("learning-story", "centre1", "block-play.webp");
  assert.equal(isPrivateMediaKey(key), true);
  assert.equal(isPrivateMediaKey(story), true);
  assert.equal(isPrivateMediaKey("https://media.kidease.ca/public/day.jpg"), false);
  assert.equal(isPublicMediaUrl("https://cdn.example/day.jpg"), true);
  assert.equal(isPublicMediaUrl("/photos/day.jpg"), true);
  assert.equal(privateMediaKey("daily-log", "../x", "a.jpg"), null);
  const signed = `https://r2.example/private/daily-log/centre1/nap.jpg?X-Amz-Signature=abc&X-Amz-Expires=${PRIVATE_MEDIA_TTL_SEC}`;
  const shown = carePhotosForViewer(
    [{ src: key || "" }, { src: "https://media.kidease.ca/public/day.jpg" }, { src: story || "" }],
    {
      enabled: true,
      sign: (value) => (value === key ? signed : null),
    },
  );
  assert.equal(shown.length, 1);
  assert.match(shown[0]?.src || "", /X-Amz-Signature=/);
  assert.equal(shown[0]?.expiresIn, PRIVATE_MEDIA_TTL_SEC);
  assert.equal(clampPrivateTtl(10), 60);
  assert.equal(clampPrivateTtl(999999), 3600);
  assert.equal(privatePhotoAccepted("https://cdn.example/a.jpg", true), false);
  assert.equal(privatePhotoAccepted(story || "", true), true);
});
