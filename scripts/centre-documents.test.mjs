import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildCentreChecklist,
  documentsVerifiedBadge,
  requiredPolicyKeys,
} from "../src/lib/centre-documents.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Manitoba asks for four policies and a stub province asks for two", () => {
  assert.deepEqual(requiredPolicyKeys("MB"), ["health", "behaviour", "emergency", "fees"]);
  assert.deepEqual(requiredPolicyKeys("ns"), ["emergency", "fees"]);
});

test("the score counts files on record and flags expiry", () => {
  const score = buildCentreChecklist({
    province: "NS",
    licenceOnFile: true,
    screeningOnFile: false,
    today: new Date("2026-11-15T00:00:00Z"),
    documents: [
      {
        id: "ins",
        kind: "insurance",
        policyKey: null,
        filename: "policy.pdf",
        expiresOn: "2026-11-20",
        reviewStatus: "pending",
        reviewReason: null,
      },
      {
        id: "em",
        kind: "policy",
        policyKey: "emergency",
        filename: "emergency.pdf",
        expiresOn: null,
        reviewStatus: "approved",
        reviewReason: null,
      },
    ],
  });
  assert.equal(score.total, 6);
  assert.equal(score.expiring, 1);
  assert.equal(score.missing, 3);
  assert.equal(score.percent, 50);
});

test("the public badge needs an approved licence and unexpired insurance", () => {
  const insurance = {
    id: "ins",
    kind: "insurance",
    policyKey: null,
    filename: "policy.pdf",
    expiresOn: "2027-01-01",
    reviewStatus: "approved",
    reviewReason: null,
  };
  assert.equal(documentsVerifiedBadge({ licenceApproved: true, insurance, today: new Date("2026-11-15T00:00:00Z") }), true);
  assert.equal(documentsVerifiedBadge({ licenceApproved: false, insurance }), false);
  assert.equal(
    documentsVerifiedBadge({
      licenceApproved: true,
      insurance: { ...insurance, reviewStatus: "pending" },
    }),
    false,
  );
});

test("the checklist stays private and off until the flag is on", () => {
  const server = read("src/lib/server/centre-documents.ts");
  const page = read("src/routes/daycare.$slug.tsx");
  assert.match(read("src/lib/private-docs.ts"), /centre-docs/);
  assert.match(server, /You can only update documents for your centre/);
  assert.match(server, /requireAdmin/);
  assert.doesNotMatch(page, /storage_ref/);
  assert.match(read("src/lib/flags.ts"), /FEATURE_CENTRE_DOCUMENTS: false/);
  assert.match(read(".env.example"), /^FEATURE_CENTRE_DOCUMENTS=0$/m);
});
