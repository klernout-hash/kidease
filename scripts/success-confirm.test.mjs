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
  attachSuccessToastBridge,
  bindSuccessHost,
  successAction,
} from "../src/lib/success-confirm.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("each success action has a specific title and the right variant", () => {
  assert.equal(tx("en", "successKicker"), "Good Job");
  assert.equal(tx("fr", "successKicker"), "Bravo\u202f!");
  assert.equal(SUCCESS_TOAST_MS, 1500);
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

  const admin = (src("src/routes/admin.tsx") + "\n" + src("src/components/admin-desk-page.tsx"));
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

test("the brief toast says Good Job, stays polite, and errors do not celebrate", () => {
  const confirm = src("src/components/success-confirm.tsx");
  assert.match(confirm, /role="status"/);
  assert.match(confirm, /aria-live="polite"/);
  assert.match(confirm, /pointer-events-none/);
  assert.match(confirm, /env\(safe-area-inset-top\)/);
  assert.match(confirm, /4\.75rem \+ env\(safe-area-inset-bottom\)/);
  assert.match(confirm, /data-success-dismiss=\{String\(SUCCESS_TOAST_MS\)\}/);
  assert.match(confirm, /data-success-centered=""/);
  assert.match(confirm, /place-items-center/);
  assert.match(confirm, /ke-good-job-burst/);
  assert.match(confirm, /items-center gap-3/);
  assert.match(src("src/styles.css"), /ke-good-job-burst[\s\S]*1\.5s/);
  assert.match(src("src/components/use-success-confirm.ts"), /celebrate\(title\?: string\)/);
  assert.match(src("src/components/kidease-toaster.tsx"), /attachSuccessToastBridge\(/);
  assert.doesNotMatch(src("src/components/kidease-toaster.tsx"), /toast\.error\s*=/);

  const seen = [];
  const unbind = bindSuccessHost((request) => seen.push(request));
  const api = {
    success(message) {
      seen.push(message);
      return message;
    },
    error(message) {
      seen.push(`err:${message}`);
    },
  };
  attachSuccessToastBridge(api);
  attachSuccessToastBridge(api);
  api.success("Saved");
  api.success("Saved again");
  api.error("No");
  const toasts = seen.filter((row) => row && row.variant === "toast");
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].title, "");
  assert.equal(seen.includes("err:No"), true);
  assert.equal(seen.filter((row) => row === "Saved" || row === "Saved again").length, 2);
  unbind();
});

test("spots, reports, and block-style saves celebrate only on the success branch", () => {
  const spots = src("src/routes/spots.$token.tsx");
  assert.ok(spots.indexOf("celebrate()") > spots.indexOf("if (!result.ok)"));
  assert.doesNotMatch(spots.slice(spots.indexOf(".catch("), spots.indexOf(".finally(")), /celebrate\(/);

  const review = src("src/components/review-report-button.tsx");
  const okBranch = review.slice(review.indexOf("if (result.ok)"), review.indexOf("} catch"));
  assert.match(okBranch, /celebrate\(\)/);
  assert.doesNotMatch(review.slice(review.indexOf("} catch")), /celebrate\(/);

  const safety = src("src/components/safety-actions.tsx");
  assert.match(safety, /toast\.success\(text\.sent\)/);
  assert.match(safety, /toast\.success\(text\.blockedNow\)/);
  assert.match(safety, /toast\.success\(text\.unblocked\)/);
  assert.match(safety, /toast\.error\(text\.failed\)/);
  assert.doesNotMatch(safety, /toast\.success\(text\.blockedSend\)/);
  const blockStart = safety.indexOf("setMessageBlock");
  assert.ok(blockStart > 0);
  assert.doesNotMatch(safety.slice(blockStart), /\.catch\([\s\S]{0,80}toast\.success/);
  assert.match(src("src/routes/inbox.$id.tsx") + src("src/components/centre-inbox.tsx"), /blockedSend/);
});
