import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  centreActionAllowed,
  centreActionDenied,
  centreCanAccessPrivileged,
  centreCanWriteLeads,
  centreDeskCaps,
} from "../src/lib/centre-roles.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("read-only cannot write, and staff or managers cannot open contracts", () => {
  for (const role of ["read_only", null]) {
    assert.equal(centreCanWriteLeads(role), false);
    assert.equal(centreActionAllowed(role, "write"), false);
    assert.equal(centreActionAllowed(role, "contracts"), false);
    assert.equal(centreActionDenied("write").status, 403);
  }
  for (const role of ["staff", "manager"]) {
    assert.equal(centreCanWriteLeads(role), true);
    assert.equal(centreCanAccessPrivileged(role), false);
    assert.equal(centreActionAllowed(role, "write"), true);
    assert.equal(centreActionAllowed(role, "contracts"), false);
    assert.equal(centreDeskCaps(role).money, false);
    assert.equal(centreDeskCaps(role).contract, false);
  }
  assert.equal(centreActionAllowed("owner", "contracts"), true);
  assert.equal(centreActionDenied("contracts").status, 403);
});

test("provider writes and private downloads reject the wrong role", () => {
  const checks = [
    ["src/lib/server/safety.ts", /setFamilyBlock[\s\S]*assertCentreAction\([\s\S]*"write"/],
    ["src/lib/server/safety.ts", /setMessageBlock[\s\S]*assertCentreAction\([\s\S]*"write"/],
    ["src/lib/server/enrol-queue.ts", /decideParentRequest[\s\S]*assertCentreAction\([\s\S]*"write"/],
    ["src/lib/server/lead-requests.ts", /updateLeadRequest[\s\S]*assertCentreAction\([\s\S]*"write"/],
    ["src/lib/server/coparent-email.ts", /saveCustodyRestriction[\s\S]*assertCentreAction\([\s\S]*"write"/],
    ["src/lib/server/parent-agreement.ts", /saveCentreAgreementTerms[\s\S]*assertCentreAction\([\s\S]*"contracts"/],
    ["src/lib/server/parent-agreement.ts", /sendParentAgreement[\s\S]*assertCentreAction\([\s\S]*"contracts"/],
    ["src/lib/server/family-vault.ts", /role === "read_only"/],
    ["src/lib/server/parent-agreement.ts", /role <> 'read_only'/],
    ["src/routes/provider.tsx", /canWrite \? <CentreFamilyDocs/],
    ["src/routes/invite.$token.tsx", /data-ke="invite-role"/],
    ["src/lib/server/centre-members.ts", /canRevoke: false/],
  ];
  for (const [file, pattern] of checks) {
    assert.match(read(file), pattern, file);
  }
});
