import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  MULTI_APPLY_MAX,
  centreAcceptsOnlineRequests,
  childKey,
  planMultiApply,
  safeExternalUrl,
  withinDuplicateWindow,
} from "../src/lib/multi-apply.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function base(over = {}) {
  return {
    daycareIds: ["a", "b"],
    centres: [
      { id: "a", live: true, phone: "204-555-0100" },
      { id: "b", live: true },
    ],
    shareConsent: true,
    childName: "Ada",
    birthdate: "2023-04-02",
    startDate: "2026-11-01",
    recentRequestCount: 0,
    recentChildCentres: [],
    now: new Date("2026-09-30T12:00:00Z"),
    ...over,
  };
}

test("a signed-in batch sends each live centre and stops at five", () => {
  const ids = ["a", "b", "c", "d", "e", "f"];
  const planned = planMultiApply(
    base({
      daycareIds: ids,
      centres: ids.map((id) => ({ id, live: true })),
    }),
  );
  assert.equal(planned.error, "too_many");
  assert.equal(MULTI_APPLY_MAX, 5);
  const five = planMultiApply(
    base({
      daycareIds: ["a", "b", "a", "c"],
      centres: ["a", "b", "c"].map((id) => ({ id, live: true })),
    }),
  );
  assert.deepEqual(five.sendIds, ["a", "b", "c"]);
  assert.equal(five.error, undefined);
});

test("unclaimed centres are not selectable and a duplicate child is blocked for 30 days", () => {
  assert.equal(centreAcceptsOnlineRequests({ live: false }), false);
  assert.equal(centreAcceptsOnlineRequests({ live: true }), true);
  const planned = planMultiApply(
    base({
      centres: [
        { id: "a", live: false, phone: "204-555-0199", website: "https://centre.example" },
        { id: "b", live: true },
      ],
      recentChildCentres: [
        {
          daycareId: "b",
          childKey: childKey("Ada", "2023-04-02"),
          sentAt: "2026-09-10T12:00:00Z",
        },
      ],
    }),
  );
  assert.deepEqual(planned.sendIds, []);
  assert.deepEqual(planned.skipped, [
    { daycareId: "a", reason: "not_accepting" },
    { daycareId: "b", reason: "duplicate" },
  ]);
  assert.equal(withinDuplicateWindow("2026-08-01T12:00:00Z", new Date("2026-09-30T12:00:00Z")), false);
  assert.equal(safeExternalUrl("javascript:alert(1)"), null);
  assert.equal(safeExternalUrl("https://centre.example/care"), "https://centre.example/care");
});

test("consent and the daily cap fail closed", () => {
  assert.equal(planMultiApply(base({ shareConsent: false })).error, "consent");
  assert.equal(planMultiApply(base({ childName: " " })).error, "details");
  assert.equal(planMultiApply(base({ recentRequestCount: 15 })).error, "rate");
  const capped = planMultiApply(base({ recentRequestCount: 14, daycareIds: ["a", "b"] }));
  assert.deepEqual(capped.sendIds, ["a"]);
  assert.deepEqual(capped.skipped, [{ daycareId: "b", reason: "cap" }]);
});

test("compare and saved centres open one shared form and do not merge threads", () => {
  const compare = readFileSync(join(root, "src/routes/compare.tsx"), "utf8");
  const saved = readFileSync(join(root, "src/components/parent-shortlist.tsx"), "utf8");
  const sheet = readFileSync(join(root, "src/components/multi-apply-sheet.tsx"), "utf8");
  const server = readFileSync(join(root, "src/lib/server/multi-apply.ts"), "utf8");
  assert.match(compare, /MultiApplyPanel/);
  assert.match(saved, /MultiApplyPanel/);
  assert.match(sheet, /multi_apply_started/);
  assert.match(sheet, /multi_apply_submitted/);
  assert.match(sheet, /capturePostHogEvent/);
  assert.match(sheet, /shareConsent/);
  assert.match(server, /insert into conversations/);
  assert.match(server, /insert into bookings/);
  assert.match(server, /recordLeadRequest/);
  assert.doesNotMatch(server, /free forever/i);
});
