import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ADMIN_CENTRE_STAT_COPY } from "../src/lib/admin-stat-filter.ts";
import {
  reviewCardLayout,
  reviewClaimKind,
  reviewDecisionFacts,
} from "../src/lib/admin-review-card.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("waiting queue is its own review section, not the dark dump", () => {
  assert.equal(ADMIN_CENTRE_STAT_COPY.waiting.title, "Daycares waiting for review");
  assert.equal(ADMIN_CENTRE_STAT_COPY.waiting.eyebrow, "Review queue");
  const admin = src("src/routes/admin.tsx");
  const card = src("src/components/admin-review-card.tsx");
  assert.match(admin, /AdminCentreStatList/);
  assert.doesNotMatch(admin, /bg-\[#1a3790\]/);
  assert.match(card, /Daycares in this queue are waiting for a decision/);
  assert.match(card, /data-ke="admin-review-actions"/);
  assert.match(card, /Keep waiting/);
});

test("card face is decision facts; contracts, payments, and registry tools sit under More", () => {
  const card = src("src/components/admin-review-card.tsx");
  const actionsAt = card.indexOf('data-ke="admin-review-actions"');
  const moreAt = card.indexOf('data-ke="admin-review-more"');
  const trustAt = card.indexOf("<TrustSignals");
  const packsAt = card.indexOf("<CentrePackChips");
  assert.ok(actionsAt > 0 && moreAt > actionsAt, "primary actions render before More");
  assert.ok(trustAt > moreAt, "trust chips render inside More");
  assert.ok(packsAt > moreAt, "contract chips render inside More");
  assert.match(card, /Contracts, payments, registry/);

  const decision = reviewCardLayout("decision");
  assert.deepEqual(decision.face, ["identity", "facts", "decision"]);
  assert.ok(decision.more.includes("trust"));
  assert.ok(decision.more.includes("contracts"));
  assert.ok(decision.more.includes("licence-tools"));

  const verify = reviewCardLayout("verify");
  assert.ok(verify.face.includes("documents"));
  assert.ok(verify.face.includes("licence-tools"));
  assert.ok(verify.more.includes("trust"));
  assert.ok(!verify.face.includes("trust"));
});

test("plain licence, screening, and photo status — no payment or contract noise", () => {
  const missing = reviewDecisionFacts({});
  assert.deepEqual(
    missing.map((fact) => [fact.id, fact.status, fact.tone]),
    [
      ["licence", "Missing", "missing"],
      ["screening", "Not attested", "missing"],
      ["photos", "Missing", "missing"],
    ],
  );

  const ready = reviewDecisionFacts({
    licensePhoto: "on-file",
    licenseStatus: "matched",
    storefrontPhoto: "https://cdn.example/photo.jpg",
    screeningOnFile: true,
  });
  assert.deepEqual(
    ready.map((fact) => fact.status),
    ["Submitted · matched", "On file", "Storefront on file"],
  );

  const expired = reviewDecisionFacts({
    licensePhoto: "on-file",
    licenseStatus: "expired",
    staffScreeningAttested: true,
  });
  assert.equal(expired[0].status, "Submitted · expired");
  assert.equal(expired[0].tone, "attention");
  assert.equal(expired[1].status, "Attested");

  const suspended = reviewDecisionFacts({ licensePhoto: "on-file", licenseStatus: "suspended" });
  assert.equal(suspended[0].status, "Submitted · suspended");

  for (const row of [missing, ready, expired, suspended]) {
    const blob = row.map((fact) => fact.status).join(" ");
    assert.doesNotMatch(blob, /payment|contract|agreement|enrolment|unverified/i);
  }
});

test("claim type distinguishes an owner claim from a new listing", () => {
  assert.deepEqual(reviewClaimKind({ hasListingClaim: true, hasProviderLink: true }), {
    id: "owner",
    label: "Owner claim",
  });
  assert.deepEqual(reviewClaimKind({ hasProviderLink: true }), {
    id: "new",
    label: "New listing",
  });
  assert.deepEqual(reviewClaimKind({}), { id: "listing", label: "Listing" });
});
