import assert from "node:assert/strict";
import { test } from "node:test";
import { isStaleAssetError } from "../src/lib/safe-error.ts";

test("stale chunk reload matches MIME failures and ignores analytics", () => {
  assert.equal(isStaleAssetError(new Error("Failed to fetch dynamically imported module: https://www.kidease.ca/assets/parent-BU1xH4H_.js")), true);
  assert.equal(
    isStaleAssetError(
      "Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of text/html",
    ),
    true,
  );
  assert.equal(isStaleAssetError(new Error("Loading chunk 12 failed.")), true);
  const chunk = new Error("");
  chunk.name = "ChunkLoadError";
  assert.equal(isStaleAssetError(chunk), true);
  assert.equal(isStaleAssetError(new Error("posthog.js failed to fetch")), false);
  assert.equal(isStaleAssetError(new Error("Could not save details")), false);
});
