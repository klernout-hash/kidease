import assert from "node:assert/strict";
import { test } from "node:test";
import { nextSubsidyStatus, subsidyStatusEnabled } from "../src/lib/wiring/subsidy-status.ts";

test("subsidy status is updated by the daycare or the same province", () => {
  assert.equal(subsidyStatusEnabled({}), false);
  assert.equal(nextSubsidyStatus({ from: null, to: "approved", actor: "parent" }).ok, false);
  const submitted = nextSubsidyStatus({ from: null, to: "submitted", actor: "parent" });
  assert.equal(submitted.ok && submitted.status, "submitted");
  const other = nextSubsidyStatus({
    from: "submitted",
    to: "approved",
    actor: "government",
    actorProvince: "BC",
    recordProvince: "AB",
  });
  assert.equal(other.ok, false);
  const same = nextSubsidyStatus({
    from: "in_review",
    to: "approved",
    actor: "government",
    actorProvince: "AB",
    recordProvince: "AB",
  });
  assert.equal(same.ok && same.status, "approved");
});
