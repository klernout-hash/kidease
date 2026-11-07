import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { draftCancellation } from "../src/lib/cancellation-policy.ts";
import {
  acceptanceSnapshot,
  buildDraftPolicy,
  canReadDispute,
  canSaveDraftPolicy,
  draftAcknowledgementNotice,
  draftShownAsActive,
  nextDisputeStatus,
  openDispute,
} from "../src/lib/draft-policy-workflow.ts";
import { shadowCommitmentRate } from "../src/lib/ranking-shadow.ts";

test("Quebec provider cancellation is a draft and is not a two-week rule for everyone", () => {
  const draft = draftCancellation({ topic: "provider-cancel", province: "QC", setting: "licensed-centre" });
  assert.equal(draft.inForce, false);
  assert.match(draft.summary, /Do not treat two weeks as the rule/);
  assert.equal(draftCancellation({ topic: "provider-cancel", province: "MB" }).summary.includes("two weeks"), false);
});

test("a draft policy stays in counsel review and the snapshot reloads the same words", () => {
  const policy = buildDraftPolicy({
    id: "pol_1",
    daycareId: "centre-1",
    topic: "pre-start",
    province: "QC",
    program: "cwelcc",
    version: 2,
  });
  assert.equal("error" in policy, false);
  if ("error" in policy) return;
  assert.equal(policy.status, "counsel-review");
  assert.equal(policy.inForce, false);
  assert.equal(policy.program, "cwelcc");
  const snap = acceptanceSnapshot(policy, "user-1");
  const again = acceptanceSnapshot(policy, "user-1");
  assert.equal(snap.bodySnapshot, again.bodySnapshot);
  assert.equal(snap.placeStatus, "draft");
  assert.equal(snap.immutable, true);
  assert.equal(snap.confirmsPlacement, false);
  assert.equal(snap.bindingConsent, false);
  assert.equal(draftShownAsActive(policy), false);
  assert.equal(draftShownAsActive({ status: "active", inForce: false }), true);
  const notice = draftAcknowledgementNotice("en");
  const avis = draftAcknowledgementNotice("fr");
  assert.match(notice, /Counsel review/);
  assert.match(notice, /not binding consent/);
  assert.match(avis, /Examen du conseiller/);
  assert.match(avis, /pas un consentement/);
  assert.doesNotMatch(`${notice}\n${avis}`, /in force|en vigueur|enrol|inscription confirmée/i);
});

test("disputes and shadow scores stay private and do not change ranking", () => {
  assert.equal(canSaveDraftPolicy({ ownsCentre: false }), false);
  assert.equal(canReadDispute({ actorId: "a", ownerId: "b", staff: false }), false);
  assert.equal(canReadDispute({ actorId: "a", ownerId: "a", staff: false }), true);
  assert.equal("error" in nextDisputeStatus({ staff: false, from: "open", to: "human-review" }), true);
  assert.equal(nextDisputeStatus({ staff: true, from: "open", to: "human-review" }), "human-review");
  const filed = openDispute({ conversationId: "cv_abcd1234", userId: "user-1", evidenceNote: "Photo of the notice" });
  assert.equal("error" in filed, false);
  if ("error" in filed) return;
  assert.equal(filed.supportReference, "KE-ABCD-1234");
  assert.equal(filed.status, "open");
  const shadow = shadowCommitmentRate({
    events: [{ kind: "provider-cancel-confirmed", evidence: true, disputed: false }],
    confirmedCommitments: 10,
  });
  assert.equal(shadow.apply, false);
  assert.equal(shadow.frozen, true);
});

test("the server keeps drafts off and does not send messages", () => {
  const server = readFileSync(new URL("../src/lib/server/draft-policy-workflow.ts", import.meta.url), "utf8");
  assert.match(server, /authMiddleware/);
  assert.match(server, /, false, \$\{built.version\}/);
  assert.doesNotMatch(server, /sendTransactionalMail|sendSms|sendEmail/);
  assert.doesNotMatch(readFileSync(new URL("../src/routes/search.tsx", import.meta.url), "utf8"), /ranking-shadow|draft_shadow_ranks/);
});
