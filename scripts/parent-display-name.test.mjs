import assert from "node:assert/strict";
import test from "node:test";
import { linkedParentName } from "../src/lib/parent-display-name.ts";
import { leadStatusForTour } from "../src/lib/lead-requests.ts";

test("a synthetic QA account name does not hide the linked guardian", () => {
  assert.equal(
    linkedParentName({ accountName: "QA parent (synthetic)", givenName: "Jonny Doey" }),
    "Jonny Doey",
  );
  assert.equal(linkedParentName({ accountName: "Ada Parent", givenName: "Jonny Doey" }), "Ada Parent");
});

test("a confirmed tour is the same status on the parent list and the provider desk", () => {
  assert.equal(leadStatusForTour("accepted"), "confirmed");
  assert.equal(leadStatusForTour("completed"), "closed");
  assert.equal(leadStatusForTour("pending"), "requested");
});
