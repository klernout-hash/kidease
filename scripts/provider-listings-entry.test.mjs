import assert from "node:assert/strict";
import test from "node:test";
import { providerListingsEntry } from "../src/lib/provider-listings-entry.ts";

const ready = {
  deskSettled: true,
  deskLoadFailed: false,
  sessionReady: true,
  layoutKnown: true,
  listingIds: ["alpha", "beta"],
};
const entry = (change) => providerListingsEntry({ ...ready, ...change });

test("a pending provider or session cannot show the fallback listings layout", () => {
  assert.equal(entry({ deskSettled: false, listingIds: [] }), "pending");
  assert.equal(entry({ sessionReady: false, layoutKnown: false }), "pending");
  assert.equal(entry({ sessionReady: false, layoutKnown: false, deskSettled: false }), "pending");
});

test("bundle or session failure takes priority over stale listings or empty", () => {
  assert.equal(entry({ deskLoadFailed: true }), "retry");
  assert.equal(entry({ deskLoadFailed: true, listingIds: [] }), "retry");
  assert.equal(entry({ sessionReady: true, layoutKnown: false }), "retry");
});

test("the listed centre must match the explicit URL and must never fall back", () => {
  assert.equal(entry({ requestedCentre: "alpha" }), "ready");
  assert.equal(entry({ requestedCentre: "beta" }), "ready");
  assert.equal(entry({ requestedCentre: "removed" }), "unavailable");
  assert.equal(entry({ requestedCentre: "removed", listingIds: [] }), "unavailable");
});

test("only a settled, successful, unscoped empty result is empty", () => {
  assert.equal(entry({ listingIds: [] }), "empty");
  assert.equal(entry({ listingIds: [], deskSettled: false }), "pending");
  assert.equal(entry({}), "ready");
});
