import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { providerDocumentsEntry } from "../src/lib/provider-documents-entry.ts";

const loaded = {
  deskSettled: true,
  deskLoadFailed: false,
  sessionReady: true,
  hasSession: true,
  canViewDocuments: true,
  listingIds: ["centre-a", "centre-b"],
};

test("documents distinguish loading, a failed request and a settled empty desk", () => {
  assert.deepEqual(providerDocumentsEntry({ ...loaded, deskSettled: false, listingIds: [] }), {
    kind: "pending",
  });
  assert.deepEqual(
    providerDocumentsEntry({ ...loaded, sessionReady: false, hasSession: false, listingIds: [] }),
    { kind: "pending" },
  );
  assert.deepEqual(providerDocumentsEntry({ ...loaded, deskLoadFailed: true }), { kind: "retry" });
  assert.deepEqual(providerDocumentsEntry({ ...loaded, hasSession: false }), { kind: "retry" });
  assert.deepEqual(providerDocumentsEntry({ ...loaded, listingIds: [] }), { kind: "empty" });
});

test("documents preserve the selected centre instead of silently opening another one", () => {
  assert.deepEqual(providerDocumentsEntry(loaded), { kind: "ready", centreId: "centre-a" });
  assert.deepEqual(providerDocumentsEntry({ ...loaded, requestedCentre: "centre-b" }), {
    kind: "ready",
    centreId: "centre-b",
  });
  assert.deepEqual(providerDocumentsEntry({ ...loaded, requestedCentre: "centre-missing" }), {
    kind: "centre-unavailable",
  });
});

test("permission denial wins over any selected centre", () => {
  assert.deepEqual(
    providerDocumentsEntry({ ...loaded, canViewDocuments: false, requestedCentre: "centre-b" }),
    { kind: "forbidden" },
  );
  assert.deepEqual(providerDocumentsEntry({ ...loaded, canViewDocuments: false, listingIds: [] }), {
    kind: "forbidden",
  });
});

test("changing centres remounts the checklist and the Claim prompt is owner-only", () => {
  const route = readFileSync(new URL("../src/routes/provider.tsx", import.meta.url), "utf8");
  assert.match(
    route,
    /<CentreDocumentChecklist key=\{documents\.centreId\} daycareId=\{documents\.centreId\}/,
  );
  assert.match(
    route,
    /documents\?\.kind === "empty"[\s\S]*?extra=\{centreOwner \? \([\s\S]*?to="\/claim"/,
  );
});
