import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { tx } from "../src/lib/copy.ts";
import {
  SUCCESS_ACTIONS,
  SUCCESS_TOAST_MS,
  approvalSuccessReady,
  successAction,
} from "../src/lib/success-confirm.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("each success action has a specific title and the right variant", () => {
  assert.equal(tx("en", "successKicker"), "Good job!");
  assert.equal(tx("fr", "successKicker"), "Bien joué !");
  assert.equal(SUCCESS_TOAST_MS, 2500);
  for (const [id, action] of Object.entries(SUCCESS_ACTIONS)) {
    const title = tx("en", action.titleKey);
    const fr = tx("fr", action.titleKey);
    assert.ok(title.length > 2, id);
    assert.ok(fr.length > 2, id);
    assert.notEqual(title, fr, id);
    assert.doesNotMatch(title, /within \d|business day|4–8 weeks|thursday morning/i, id);
    if (action.bodyKey) {
      const body = tx("en", action.bodyKey);
      assert.doesNotMatch(body, /within \d|business day|4–8 weeks|thursday morning/i, id);
    }
    assert.ok(action.variant === "modal" || action.variant === "toast", id);
  }
  assert.equal(successAction("tour").variant, "modal");
  assert.equal(successAction("tour").titleKey, "requestSentHeadlineTour");
  assert.equal(successAction("profileSaved").variant, "toast");
  assert.equal(successAction("claimSubmitted").variant, "modal");
  assert.equal(successAction("daycareApproved").variant, "modal");
  assert.equal(successAction("photoStraightened").variant, "toast");
  assert.equal(tx("en", successAction("daycareApproved").titleKey), "Daycare approved");
  assert.equal(tx("en", successAction("claimSubmitted").titleKey), "Claim submitted");
});

test("approve success is gated on every health check", () => {
  assert.equal(approvalSuccessReady(null), false);
  assert.equal(approvalSuccessReady({ ok: false, health: { ok: true } }), false);
  assert.equal(approvalSuccessReady({ ok: true, health: { ok: false } }), false);
  assert.equal(approvalSuccessReady({ ok: true, health: null }), false);
  assert.equal(approvalSuccessReady({ ok: true, health: { ok: true } }), true);

  const admin = src("src/routes/admin.tsx");
  const gate = admin.indexOf("approvalSuccessReady(result)");
  const cheer = admin.indexOf('confirmAction(t, "daycareApproved"');
  assert.ok(gate !== -1 && cheer > gate);
  const decide = admin.slice(admin.indexOf("async function onDecide"), admin.indexOf("async function onLicense"));
  const failure = decide.slice(decide.indexOf("catch"), decide.indexOf("finally"));
  assert.doesNotMatch(failure, /confirmAction|confirmSuccess/);
  assert.match(failure, /alert\(/);
});

test("reduced motion still renders the check and toasts stay polite", () => {
  const confirm = src("src/components/success-confirm.tsx");
  assert.match(confirm, /usePrefersReducedMotion/);
  assert.match(confirm, /prefers-reduced-motion: reduce/);
  assert.match(confirm, /flourish && "ke-check-pop"/);
  assert.match(confirm, /aria-live="polite"/);
  assert.match(confirm, /SUCCESS_TOAST_MS/);
  assert.match(confirm, /data-success-variant="toast"/);
  assert.match(confirm, /data-success-variant="modal"/);
  assert.match(src("src/routes/__root.tsx"), /SuccessConfirmHost/);
});

test("quick saves and milestones call confirm only on the success path", () => {
  const child = src("src/components/child-profile-form.tsx");
  const childCatch = child.slice(child.indexOf("catch"), child.indexOf("finally"));
  assert.match(child, /confirmAction\(t, added \? "childAdded" : "childSaved"\)/);
  assert.doesNotMatch(childCatch, /confirmAction/);
  assert.match(child, /data-ke="child-saved"/);

  const claim = src("src/routes/claim.tsx");
  assert.match(claim, /confirmAction\(t, "claimSubmitted"/);
  const claimCatch = claim.slice(claim.indexOf("async function verify"), claim.indexOf("function rejectLicense"));
  assert.doesNotMatch(claimCatch.slice(claimCatch.indexOf("catch")), /confirmAction/);

  assert.match(src("src/components/provider-listing-forms.tsx"), /confirmAction\(t, id\)/);
  assert.match(src("src/components/provider-listing-forms.tsx"), /"photoUploaded"/);
  assert.match(src("src/components/provider-listing-forms.tsx"), /"openingsUpdated"/);
  assert.match(src("src/components/save-listing-button.tsx"), /confirmAction\(t, nowSaved \? "listingSaved" : "listingRemoved"\)/);
});
