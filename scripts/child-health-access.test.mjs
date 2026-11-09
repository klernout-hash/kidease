import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canReadChildHealth, healthLogFields } from "../src/lib/child-health-access.ts";

test("health notes stay with the parent or the enrolled centre", () => {
  assert.equal(
    canReadChildHealth({ viewer: "parent", viewerId: "p1", childOwnerId: "p1", enrolledAtCentre: false }),
    true,
  );
  assert.equal(
    canReadChildHealth({ viewer: "parent", viewerId: "p2", childOwnerId: "p1", enrolledAtCentre: true }),
    false,
  );
  assert.equal(
    canReadChildHealth({ viewer: "provider", viewerId: "c1", childOwnerId: "p1", enrolledAtCentre: true }),
    true,
  );
  assert.equal(
    canReadChildHealth({ viewer: "staff", viewerId: "s1", childOwnerId: "p1", enrolledAtCentre: true }),
    true,
  );
  assert.equal(
    canReadChildHealth({ viewer: "provider", viewerId: "c1", childOwnerId: "p1", enrolledAtCentre: false }),
    false,
  );
  assert.equal(
    canReadChildHealth({ viewer: "public", viewerId: "x", childOwnerId: "p1", enrolledAtCentre: true }),
    false,
  );
  assert.equal(
    canReadChildHealth({ viewer: "admin", viewerId: "a", childOwnerId: "p1", enrolledAtCentre: true }),
    false,
  );
});

test("blank health fields stay blank", () => {
  assert.deepEqual(
    healthLogFields({ immunizationStatus: " ", immunizationNote: null, allergies: "", medications: undefined }),
    { immunizationStatus: "", immunizationNote: "", allergies: "", medications: "" },
  );
  const page = readFileSync(new URL("../src/routes/daycare.$slug.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /data-ke="child-health-log"/);
});
