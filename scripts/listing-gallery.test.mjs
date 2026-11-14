import assert from "node:assert/strict";
import { test } from "node:test";
import { galleryIndex, nextGalleryIndex, roomPhotoIndex } from "../src/lib/listing-gallery.ts";

test("photo navigation wraps and stays valid as photos change", () => {
  assert.equal(nextGalleryIndex(0, 3, -1), 2);
  assert.equal(nextGalleryIndex(2, 3, 1), 0);
  assert.equal(nextGalleryIndex(0, 1, 1), 0);
  assert.equal(nextGalleryIndex(0, 0, -1), 0);
  assert.equal(galleryIndex(9, 2), 1);
  assert.equal(galleryIndex(-1, 2), 0);
  assert.equal(galleryIndex(Number.NaN, 2), 0);
});

test("a room photo opens its exact image and unknown images are rejected", () => {
  const photos = ["/photos/exterior.jpg", "/photos/reading-room.jpg", "/photos/play-room.jpg"];
  assert.equal(roomPhotoIndex(photos, "/photos/reading-room.jpg"), 1);
  assert.equal(roomPhotoIndex(photos, "/photos/missing-room.jpg"), null);
  assert.equal(roomPhotoIndex([], "/photos/reading-room.jpg"), null);
});
