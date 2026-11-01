import assert from "node:assert/strict";
import { test } from "node:test";
import { complaintUpdate, complaintUpdatesEnabled, pickComplaintSource } from "../src/lib/wiring/complaint-updates.ts";

test("complaint updates stay in province and prefer gov complaints when present", () => {
  assert.equal(complaintUpdatesEnabled({}), false);
  assert.equal(pickComplaintSource(true), "gov_complaints");
  assert.equal(pickComplaintSource(false), "safety_reports");
  const blocked = complaintUpdate({ note: "We wrote to you.", actorProvince: "NS", recordProvince: "NB", parentUserId: "p1" });
  assert.equal(blocked.ok, false);
  const ok = complaintUpdate({ note: "We wrote to you.", actorProvince: "NS", recordProvince: "NS", parentUserId: "p1" });
  assert.equal(ok.ok, true);
});
