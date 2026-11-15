import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { approvalClickFeedback } from "../src/lib/approve-live.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("a failed Approve click says the centre was not marked Live", () => {
  const feedback = approvalClickFeedback({
    ok: false,
    health: {
      ok: false,
      failed: ["licence"],
      checks: [{ id: "licence", ok: false, detail: "Licence number is missing" }],
    },
  });
  assert.equal(feedback.saved, false);
  assert.match(feedback.body, /not marked Live/);
  assert.match(feedback.body, /Licence number is missing/);
});

test("a passed Approve click says the decision was saved", () => {
  const feedback = approvalClickFeedback({
    ok: true,
    health: {
      ok: true,
      failed: [],
      checks: [{ id: "approved_live", ok: true, detail: "Approved and Live" }],
    },
  });
  assert.equal(feedback.saved, true);
  assert.match(feedback.body, /Live/);
});

test("approve buttons report success or the reason instead of staying silent", () => {
  const desk = src("src/components/admin-desk-page.tsx");
  const screening = src("src/components/admin-screening.tsx");
  const reviews = src("src/components/admin-reviews.tsx");
  const provider = src("src/routes/provider.tsx");
  const truth = src("src/routes/admin-truth.tsx");
  assert.match(desk, /approvalClickFeedback/);
  assert.match(desk, /toast\.error\(feedback\.body\)/);
  assert.match(desk, /toast\.success\(feedback\.body\)/);
  assert.match(desk, /registry-matched/);
  assert.match(src("src/components/admin-licence-reads.tsx"), /setSaved/);
  assert.match(screening, /toast\.success\(t\("screeningReviewed"\)\)/);
  assert.match(reviews, /toast\.success/);
  assert.match(provider, /portfolio:incomplete/);
  assert.match(provider, /approveBlocked/);
  assert.doesNotMatch(provider, /disabled=\{r\.portfolioComplete === false/);
  assert.match(truth, /adminTruthApproveFailed/);
  assert.match(truth, /setSaved/);
});
