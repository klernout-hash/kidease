import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { acceptanceSnapshot, draftCancellation } from "../src/lib/cancellation-policy.ts";
import { countsTowardShadowRate, shadowCommitmentRate } from "../src/lib/ranking-shadow.ts";
import { messageReferenceInBody, withMessageReference } from "../src/lib/support-desk.ts";

test("support notes can carry a message number and a bad number is dropped", () => {
  const body = withMessageReference("The tour time was wrong.", "KE-ODSR-BBM8-AFZD");
  assert.match(body, /KE-ODSR-BBM8-AFZD/);
  assert.equal(messageReferenceInBody(body), "KE-ODSR-BBM8-AFZD");
  assert.equal(messageReferenceInBody(withMessageReference("Hello", "nope")), null);
});

test("cancellation text stays a draft and does not invent one national fee", () => {
  const tour = draftCancellation({ topic: "tour", province: "ON" });
  assert.equal(tour.inForce, false);
  assert.equal(tour.status, "counsel-review");
  const qc = draftCancellation({ topic: "provider-cancel", province: "QC" });
  assert.match(qc.summary, /not settled/);
  assert.equal(qc.counselOpen.length > 0, true);
  const on = draftCancellation({ topic: "planned-closure", province: "ON", fundedProgram: false });
  assert.doesNotMatch(on.summary, /four weeks/);
  const snap = acceptanceSnapshot({ versionId: "draft-1", text: tour.summary, at: "2026-11-07" });
  assert.equal(snap.confirmsPlacement, false);
});

test("shadow ranking never applies and ignores withdrawals and disputes", () => {
  assert.equal(countsTowardShadowRate({ kind: "parent-withdrawal", evidence: true, disputed: false }), false);
  assert.equal(countsTowardShadowRate({ kind: "enquiry", evidence: true, disputed: false }), false);
  assert.equal(countsTowardShadowRate({ kind: "emergency", evidence: true, disputed: false }), false);
  assert.equal(countsTowardShadowRate({ kind: "provider-cancel-confirmed", evidence: true, disputed: true }), false);
  assert.equal(countsTowardShadowRate({ kind: "provider-cancel-confirmed", evidence: false, disputed: false }), false);
  const low = shadowCommitmentRate({
    events: [{ kind: "provider-cancel-confirmed", evidence: true, disputed: false }],
    confirmedCommitments: 3,
  });
  assert.equal(low.apply, false);
  assert.equal(low.rate, null);
  const shadow = shadowCommitmentRate({
    events: [{ kind: "provider-cancel-confirmed", evidence: true, disputed: false }],
    confirmedCommitments: 10,
  });
  assert.equal(shadow.apply, false);
  assert.equal(shadow.reason, "shadow-only");
  const flags = readFileSync(new URL("../src/lib/flags.ts", import.meta.url), "utf8");
  assert.match(flags, /FEATURE_SUPPORT_CHAT: false/);
});
