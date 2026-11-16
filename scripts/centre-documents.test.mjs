import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildCentreChecklist,
  documentsVerifiedBadge,
  requiredPolicyKeys,
  upsertStoredDocument,
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

test("uploading a health policy, reloading, and removing it updates the score", () => {
  const today = new Date("2026-11-15T00:00:00Z");
  const base = { province: "MB", licenceOnFile: false, screeningOnFile: false, today };
  const empty = buildCentreChecklist({ ...base, documents: [] });
  const health = empty.items.find((item) => item.policyKey === "health");
  assert.equal(health?.freshness, "missing");
  assert.equal(empty.percent, 0);
  const uploaded = upsertStoredDocument([], {
    id: "doc-health",
    kind: "policy",
    policyKey: "health",
    filename: "health.pdf",
    expiresOn: null,
    reviewStatus: "pending",
    reviewReason: null,
  });
  const present = buildCentreChecklist({ ...base, documents: uploaded });
  const saved = present.items.find((item) => item.policyKey === "health");
  assert.equal(saved?.freshness, "uploaded");
  assert.equal(saved?.documentId, "doc-health");
  assert.ok(present.percent > empty.percent);
  const removed = buildCentreChecklist({ ...base, documents: upsertStoredDocument(uploaded, uploaded[0]).filter((row) => row.id !== "doc-health") });
  assert.equal(removed.items.find((item) => item.policyKey === "health")?.freshness, "missing");
  assert.equal(removed.percent, 0);
  const server = read("src/lib/server/centre-documents.ts");
  const ui = read("src/components/centre-document-checklist.tsx");
  assert.match(server, /returning id/);
  assert.match(server, /That file was not saved/);
  assert.doesNotMatch(server, /from centre_documents\s+where daycare_id[\s\S]{0,180}\.catch\(\(\) => \[\]/);
  assert.match(ui, /copy\.remove/);
  assert.match(ui, /saved\.checklist/);
  assert.match(ui, /removed\.checklist/);
});

test("the checklist stays private and off until the flag is on", () => {
  const server = read("src/lib/server/centre-documents.ts");
  const page = read("src/routes/daycare.$slug.tsx");
  assert.match(read("src/lib/private-docs.ts"), /centre-docs/);
  assert.match(server, /document_upload/);
  assert.match(server, /requireAdmin/);
  assert.doesNotMatch(page, /storage_ref/);
  assert.match(read("src/lib/flags.ts"), /FEATURE_CENTRE_DOCUMENTS: false/);
  assert.match(read(".env.example"), /^FEATURE_CENTRE_DOCUMENTS=0$/m);
});
