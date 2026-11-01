import assert from "node:assert/strict";
import { test } from "node:test";
import { acceptInspection, inspectionSummary, inspectionSyncEnabled } from "../src/lib/wiring/inspection-sync.ts";

test("inspection sync keeps a public source and date only", () => {
  assert.equal(inspectionSyncEnabled({}), false);
  const kept = acceptInspection({
    province: "ON",
    licenceNumber: "CC-100",
    inspectedOn: "2026-04-02",
    outcome: "Follow-up required",
    summary: "Posted on the public page.",
    sourceUrl: "https://www.ontario.ca/page/child-care-rules-ontario",
  });
  assert.equal("error" in kept, false);
  const dropped = acceptInspection({
    province: "ON",
    licenceNumber: "CC-100",
    inspectedOn: "2026-04-02",
    outcome: "Made up",
    summary: "",
    sourceUrl: "https://example.com/fake",
  });
  assert.equal("error" in dropped, true);
  if ("error" in kept) return;
  const summary = inspectionSummary([kept]);
  assert.equal(summary?.inspectedOn, "2026-04-02");
  assert.match(summary?.source || "", /ontario\.ca/);
  assert.equal(inspectionSummary([]), null);
});
