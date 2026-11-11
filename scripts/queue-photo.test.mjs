import assert from "node:assert/strict";
import { test } from "node:test";
import { LISTING_PLACEHOLDER } from "../src/lib/listing-photo.ts";
import { queueStorefrontSrc } from "../src/lib/queue-photo.ts";

test("a missing building photo does not stay on the website origin", () => {
  assert.equal(queueStorefrontSrc("/photos/buildings/mb-1028.jpg"), LISTING_PLACEHOLDER);
  const known = queueStorefrontSrc("/photos/buildings/mb-1052.jpg");
  assert.notEqual(known, "/photos/buildings/mb-1052.jpg");
  assert.match(known, /\/img\?src=|media\.kidease\.ca\/photos\/buildings\/mb-1052\.jpg/);
});
