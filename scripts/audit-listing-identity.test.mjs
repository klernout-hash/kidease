import assert from "node:assert/strict";
import { test } from "node:test";
import { auditListingIdentity } from "./audit-listing-identity.mjs";
import { officialLicenceNumber } from "../src/lib/licensing.ts";

test("catalogue audit reports imported hashes and postal placeholder names", () => {
  assert.deepEqual(auditListingIdentity([
    { id: "a", name: "Stratford, PE C1B 2W8", licenseNumber: "ab1234567890cdef" },
    { id: "b", name: "Daycare K1A 0B1", licence_number: "d_a12345" },
    { id: "c", name: "Little Learners", licenseNumber: "1234567" },
  ]), [
    { row: 1, id: "a", issues: ["hash-like licence", "postal-code name"] },
    { row: 2, id: "b", issues: ["hash-like licence", "postal-code name"] },
  ]);
  assert.equal(officialLicenceNumber("ab1234567890cdef", "ab-1"), null);
  assert.equal(officialLicenceNumber("1234567", "on-1"), "1234567");
  assert.equal(officialLicenceNumber("P123456", "on-2"), "P123456");
});
