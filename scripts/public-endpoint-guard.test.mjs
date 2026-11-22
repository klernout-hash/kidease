import assert from "node:assert/strict";
import { test } from "node:test";
import {
  IMAGE_MAX,
  QC_CONTACT_MAX,
  QC_LIST_CAP,
  imageRequestAllowed,
  limitAllows,
} from "../src/lib/public-endpoint-guard.ts";

test("image processing stays on KidEase origins", () => {
  assert.equal(imageRequestAllowed({ secFetchSite: "same-origin", requestHost: "www.kidease.ca" }), true);
  assert.equal(
    imageRequestAllowed({
      secFetchSite: "cross-site",
      origin: "https://evil.example",
      requestHost: "www.kidease.ca",
    }),
    false,
  );
  assert.equal(
    imageRequestAllowed({
      origin: "https://kidease.ca",
      requestHost: "www.kidease.ca",
    }),
    true,
  );
  assert.equal(
    imageRequestAllowed({
      secFetchSite: "cross-site",
      origin: "https://evil.example",
      authenticated: true,
    }),
    true,
  );
  assert.equal(limitAllows(QC_CONTACT_MAX, QC_CONTACT_MAX), true);
  assert.equal(limitAllows(QC_CONTACT_MAX + 1, QC_CONTACT_MAX), false);
  assert.equal(QC_LIST_CAP, 60);
  assert.equal(IMAGE_MAX > 0, true);
});
