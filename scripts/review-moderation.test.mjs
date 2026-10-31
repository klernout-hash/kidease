import assert from "node:assert/strict";
import { test } from "node:test";
import {
  moderationActionLabel,
  moderationActions,
  moderationLabel,
} from "../src/lib/safety.ts";

test("a reported review is labeled Review and gets review actions", () => {
  assert.equal(moderationLabel("review"), "Review");
  assert.equal(moderationLabel("review", "fr"), "Avis");
  assert.equal(moderationLabel("listing"), "Listing");
  assert.equal(moderationLabel("thread"), "Message");
  assert.deepEqual([...moderationActions("review")], ["keep_review", "hide_review", "remove_review"]);
  assert.deepEqual([...moderationActions("listing")], ["reviewed", "dismissed"]);
  assert.deepEqual([...moderationActions("thread")], ["reviewed", "dismissed"]);
  assert.equal(moderationActionLabel("hide_review"), "Hide review");
  assert.equal(moderationActionLabel("remove_review", "fr"), "Retirer l’avis");
  assert.doesNotMatch(moderationActions("review").join(" "), /dismissed|reviewed/);
});
