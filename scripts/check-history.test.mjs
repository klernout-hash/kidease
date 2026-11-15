import assert from "node:assert/strict";
import test from "node:test";
import { groupCheckHistory } from "../src/lib/check-history.ts";

test("past check-ins stay grouped by the centre day, newest first", () => {
  const groups = groupCheckHistory([
    { id: "a", at: "2026-11-11T15:00:00.000Z", timeZone: "America/Winnipeg", action: "check_in" },
    { id: "b", at: "2026-11-11T22:00:00.000Z", timeZone: "America/Winnipeg", action: "check_out" },
    { id: "c", at: "2026-11-15T15:00:00.000Z", timeZone: "America/Winnipeg", action: "check_in" },
  ]);
  assert.deepEqual(groups.map((group) => group.day), ["2026-11-15", "2026-11-11"]);
  assert.equal(groups[1].events.length, 2);
});
